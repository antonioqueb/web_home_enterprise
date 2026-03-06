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
        this.menu = useService("menu");
        this.notification = useService("notification");
        this.appsGrid = useRef("appsGrid");

        this.state = useState({
            apps: [],
            filteredApps: [],
            loading: true,
            searchQuery: '',
            showUserMenu: false,
            draggingId: null,
            dragOverId: null,
            backgroundStyle: 'background: linear-gradient(135deg, #714B67 0%, #3d1f4d 40%, #1a0a2e 100%);',
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
    // SETTINGS & BACKGROUND
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
        if (type === 'solid') {
            const color = settings.background_color || '#6C2EB9';
            this.state.backgroundStyle = `background: ${color};`;
        } else if (type === 'image' && settings.background_image_url) {
            this.state.backgroundStyle = `background: url('${settings.background_image_url}') center center / cover no-repeat;`;
        } else {
            this.state.backgroundStyle = 'background: linear-gradient(135deg, #714B67 0%, #3d1f4d 40%, #1a0a2e 100%);';
        }
    }

    // ============================================================
    // MENU LOADING — usa menu service de Odoo directamente
    // ============================================================

    async _loadApps() {
        try {
            // El menu service ya tiene los menús cargados
            const menuData = this.menu.getMenuAsTree("root");
            const apps = this._processMenuTree(menuData);
            const ordered = this._applyUserOrder(apps);
            this.state.apps = ordered;
            this.state.filteredApps = [...ordered];
        } catch (e) {
            console.error('[HomeScreen] Failed to load apps via menu service, trying fallback', e);
            await this._loadAppsFallback();
        } finally {
            this.state.loading = false;
        }
    }

    _processMenuTree(menuTree) {
        // menuTree.childrenTree son los apps de primer nivel
        const children = menuTree.childrenTree || menuTree.children || [];
        const apps = [];
        for (const menu of children) {
            if (!menu.id) continue;
            apps.push({
                id: menu.id,
                name: menu.name,
                xmlid: menu.xmlid || '',
                appID: menu.appID || menu.id,
                web_icon: menu.webIconData ? null : (menu.webIcon || null),
                web_icon_data: menu.webIconData || null,
                color: getAppColor(menu.id),
                initials: getInitials(menu.name),
            });
        }
        return apps;
    }

    async _loadAppsFallback() {
        // Fallback: leer load_menus directamente
        try {
            const menuData = await this.orm.call('ir.ui.menu', 'load_menus', [false]);
            if (!menuData || !menuData.root) return;
            const apps = [];
            for (const menuId of (menuData.root.children || [])) {
                const menu = menuData[menuId];
                if (!menu) continue;
                if (!menu.web_icon && !menu.action && !(menu.children && menu.children.length)) continue;
                apps.push({
                    id: menuId,
                    name: menu.name,
                    xmlid: menu.xmlid || '',
                    appID: menuId,
                    web_icon: menu.web_icon || null,
                    web_icon_data: menu.web_icon_data || null,
                    color: getAppColor(menuId),
                    initials: getInitials(menu.name),
                });
            }
            const ordered = this._applyUserOrder(apps);
            this.state.apps = ordered;
            this.state.filteredApps = [...ordered];
        } catch (e) {
            console.error('[HomeScreen] Fallback also failed', e);
        }
    }

    _applyUserOrder(apps) {
        const order = this._userAppOrder || [];
        if (!order.length) return apps;
        const appMap = {};
        for (const app of apps) {
            appMap[String(app.id)] = app;
            if (app.xmlid) appMap[app.xmlid] = app;
        }
        const ordered = [];
        const placed = new Set();
        for (const key of order) {
            const app = appMap[String(key)];
            if (app && !placed.has(app.id)) {
                ordered.push(app);
                placed.add(app.id);
            }
        }
        for (const app of apps) {
            if (!placed.has(app.id)) ordered.push(app);
        }
        return ordered;
    }

    // ============================================================
    // SEARCH
    // ============================================================

    onSearchInput(ev) {
        const q = (ev.target.value || '').toLowerCase().trim();
        this.state.searchQuery = q;
        if (!q) {
            this.state.filteredApps = [...this.state.apps];
        } else {
            this.state.filteredApps = this.state.apps.filter(app =>
                app.name.toLowerCase().includes(q)
            );
        }
    }

    clearSearch() {
        this.state.searchQuery = '';
        this.state.filteredApps = [...this.state.apps];
    }

    // ============================================================
    // APP NAVIGATION — usa menu service para navegar
    // ============================================================

    openApp(ev, app) {
        ev.stopPropagation();
        try {
            // Navegar usando el menu service — la forma correcta en Odoo 19
            this.menu.selectMenu(app.id);
        } catch (e) {
            console.warn('[HomeScreen] menu.selectMenu failed, trying selectAppMenu', e);
            try {
                // Algunos builds usan selectAppMenu
                this.menu.selectAppMenu(app.id);
            } catch (e2) {
                console.warn('[HomeScreen] selectAppMenu failed, trying doAction', e2);
                // Último fallback
                if (app.xmlid) {
                    window.location.href = `/odoo/${app.xmlid}`;
                }
            }
        }
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
        this.action.doAction({
            type: 'ir.actions.act_url',
            url: '/odoo/settings',
            target: 'self',
        });
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
        const [moved] = apps.splice(srcIdx, 1);
        apps.splice(tgtIdx, 0, moved);
        this.state.apps = apps;
        this.state.filteredApps = [...apps];
        this.state.draggingId = null;
        this.state.dragOverId = null;
        this._dragSrcApp = null;
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
            await fetch('/web/home/save_app_order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'call', id: 1,
                    params: { order_json: JSON.stringify(orderIds) }
                }),
            });
        } catch (e) {
            console.warn('[HomeScreen] Could not save app order', e);
        }
    }
}

registry.category("actions").add("web_home_enterprise.HomeScreen", HomeScreen);