/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";

const APP_COLORS = [
    '#714B67', '#00A09D', '#3D6089', '#E05858', '#F4A261',
    '#2A9D8F', '#E76F51', '#264653', '#A8DADC', '#457B9D',
    '#6D3B47', '#4CAF50', '#FF5722', '#9C27B0', '#2196F3',
];

function getAppColor(appId) {
    return APP_COLORS[appId % APP_COLORS.length];
}

function getInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

export class HomeScreen extends Component {
    static template = "web_home_enterprise.HomeScreen";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.router = useService("router");
        this.appsGrid = useRef("appsGrid");

        this.state = useState({
            apps: [],
            filteredApps: [],
            loading: true,
            searchQuery: '',
            showUserMenu: false,
            draggingId: null,
            dragOverId: null,
            backgroundStyle: '',
            // User info
            userName: session.name || 'User',
            userEmail: session.partner_display_name || '',
            userAvatar: session.uid ? `/web/image/res.users/${session.uid}/avatar_128` : null,
            companyName: session.company_name || 'Odoo',
            companyLogo: session.company_logo_url || null,
        });

        this._dragSrcApp = null;
        this._clickOutsideHandler = this._onClickOutside.bind(this);

        onMounted(async () => {
            await this._loadSettings();
            await this._loadApps();
            document.addEventListener('click', this._clickOutsideHandler, true);
        });

        onWillUnmount(() => {
            document.removeEventListener('click', this._clickOutsideHandler, true);
        });
    }

    get greetingText() { return getGreeting(); }
    get userFirstName() {
        const name = this.state.userName || '';
        return name.split(' ')[0] || name;
    }
    get userInitials() { return getInitials(this.state.userName); }
    get currentYear() { return new Date().getFullYear(); }

    // ============================================================
    // DATA LOADING
    // ============================================================

    async _loadSettings() {
        try {
            const res = await fetch('/web/home/get_settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: {} }),
            });
            const data = await res.json();
            const settings = data.result || {};
            this._applyBackground(settings);
            this._userAppOrder = JSON.parse(settings.app_order || '[]');
        } catch (e) {
            console.warn('[HomeScreen] Could not load settings', e);
            this._userAppOrder = [];
        }
    }

    _applyBackground(settings) {
        const type = settings.background_type || 'gradient';
        let style = '';
        if (type === 'gradient') {
            style = 'background: linear-gradient(135deg, #714B67 0%, #3d1f4d 40%, #1a0a2e 100%);';
        } else if (type === 'solid') {
            const color = settings.background_color || '#6C2EB9';
            style = `background: ${color};`;
        } else if (type === 'image' && settings.background_image_url) {
            style = `background: url('${settings.background_image_url}') center center / cover no-repeat;`;
        } else {
            style = 'background: linear-gradient(135deg, #714B67 0%, #3d1f4d 40%, #1a0a2e 100%);';
        }
        this.state.backgroundStyle = style;
    }

    async _loadApps() {
        try {
            // Get top-level menus (apps)
            const menus = await this.orm.call('ir.ui.menu', 'load_menus', [false]);
            const apps = this._processMenus(menus);
            const ordered = this._applyUserOrder(apps);
            this.state.apps = ordered;
            this.state.filteredApps = [...ordered];
        } catch (e) {
            console.error('[HomeScreen] Failed to load apps', e);
            this.state.apps = [];
            this.state.filteredApps = [];
        } finally {
            this.state.loading = false;
        }
    }

    _processMenus(menuData) {
        // menuData is an object: { root: { children: [...] }, id_to_action: {...}, ... }
        // We need the top-level children of root which are "app" menus
        if (!menuData || !menuData.root) return [];

        const apps = [];
        const rootChildren = menuData.root.children || [];

        for (const menuId of rootChildren) {
            const menu = menuData[menuId];
            if (!menu) continue;
            // Skip if it has no action and no children with actions (pure separators)
            const isApp = menu.web_icon || menu.action || (menu.children && menu.children.length > 0);
            if (!isApp) continue;

            apps.push({
                id: menuId,
                name: menu.name,
                xmlid: menu.xmlid || '',
                action: menu.action,
                web_icon: menu.web_icon,
                web_icon_data: menu.web_icon_data || null,
                color: getAppColor(menuId),
                initials: getInitials(menu.name),
            });
        }
        return apps;
    }

    _applyUserOrder(apps) {
        const order = this._userAppOrder || [];
        if (!order.length) return apps;

        const appMap = {};
        for (const app of apps) {
            appMap[app.id] = app;
            if (app.xmlid) appMap[app.xmlid] = app;
        }

        const ordered = [];
        const placed = new Set();

        for (const key of order) {
            const app = appMap[key];
            if (app && !placed.has(app.id)) {
                ordered.push(app);
                placed.add(app.id);
            }
        }

        // Append any apps not in the saved order
        for (const app of apps) {
            if (!placed.has(app.id)) {
                ordered.push(app);
            }
        }
        return ordered;
    }

    // ============================================================
    // SEARCH
    // ============================================================

    onSearchInput(ev) {
        const q = (ev.target.value || '').toLowerCase().trim();
        this.state.searchQuery = q;
        this._filterApps(q);
    }

    _filterApps(query) {
        if (!query) {
            this.state.filteredApps = [...this.state.apps];
        } else {
            this.state.filteredApps = this.state.apps.filter(app =>
                app.name.toLowerCase().includes(query)
            );
        }
    }

    clearSearch() {
        this.state.searchQuery = '';
        this.state.filteredApps = [...this.state.apps];
    }

    // ============================================================
    // APP NAVIGATION
    // ============================================================

    openApp(ev, app) {
        if (app.action) {
            this.action.doAction(app.action);
        } else {
            // Navigate to menu
            this.action.doAction({
                type: 'ir.actions.act_url',
                url: `/odoo/${app.xmlid || app.id}`,
                target: 'self',
            }).catch(() => {
                // Fallback: click the menu item directly
                this._clickMenuItem(app.id);
            });
        }
    }

    _clickMenuItem(menuId) {
        // Fallback to triggering Odoo's menu navigation
        const event = new CustomEvent('menu-clicked', { detail: { id: menuId } });
        document.dispatchEvent(event);
    }

    onIconError(ev, app) {
        ev.target.style.display = 'none';
        app.web_icon = null;
        app.web_icon_data = null;
    }

    // ============================================================
    // USER MENU
    // ============================================================

    toggleUserMenu() {
        this.state.showUserMenu = !this.state.showUserMenu;
    }

    closeUserMenu() {
        this.state.showUserMenu = false;
    }

    _onClickOutside(ev) {
        const dropdown = document.querySelector('.o_home_user_dropdown');
        const userMenu = document.querySelector('.o_home_user_menu');
        if (
            this.state.showUserMenu &&
            dropdown && userMenu &&
            !dropdown.contains(ev.target) &&
            !userMenu.contains(ev.target)
        ) {
            this.state.showUserMenu = false;
        }
    }

    openPreferences() {
        this.state.showUserMenu = false;
        this.action.doAction('base.action_res_users_my');
    }

    openSettings() {
        this.state.showUserMenu = false;
        this.action.doAction('base_setup.action_general_configuration');
    }

    onLogout() {
        window.location.href = '/web/session/logout';
    }

    // ============================================================
    // DRAG & DROP
    // ============================================================

    onDragStart(ev, app) {
        this._dragSrcApp = app;
        this.state.draggingId = app.id;
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', String(app.id));
    }

    onDragOver(ev, app) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        if (this._dragSrcApp && this._dragSrcApp.id !== app.id) {
            this.state.dragOverId = app.id;
        }
    }

    onDragLeave() {
        this.state.dragOverId = null;
    }

    onDrop(ev, targetApp) {
        ev.preventDefault();
        if (!this._dragSrcApp || this._dragSrcApp.id === targetApp.id) return;

        const apps = [...this.state.apps];
        const srcIdx = apps.findIndex(a => a.id === this._dragSrcApp.id);
        const tgtIdx = apps.findIndex(a => a.id === targetApp.id);

        if (srcIdx === -1 || tgtIdx === -1) return;

        // Move src to tgt position
        const [moved] = apps.splice(srcIdx, 1);
        apps.splice(tgtIdx, 0, moved);

        this.state.apps = apps;
        this.state.filteredApps = [...apps];
        this.state.draggingId = null;
        this.state.dragOverId = null;
        this._dragSrcApp = null;

        // Persist order
        this._saveAppOrder(apps);
    }

    onDragEnd() {
        this.state.draggingId = null;
        this.state.dragOverId = null;
        this._dragSrcApp = null;
    }

    async _saveAppOrder(apps) {
        try {
            const orderIds = apps.map(a => a.xmlid || a.id);
            const orderJson = JSON.stringify(orderIds);
            await fetch('/web/home/save_app_order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'call', id: 1,
                    params: { order_json: orderJson }
                }),
            });
        } catch (e) {
            console.warn('[HomeScreen] Could not save app order', e);
        }
    }
}

// Register as a client action
registry.category("actions").add("web_home_enterprise.HomeScreen", HomeScreen);
