/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

// ============================================================
// HELPERS
// ============================================================

const APP_COLORS = [
    'linear-gradient(135deg,#7c5cfc,#a78bfa)',
    'linear-gradient(135deg,#22d3a5,#059669)',
    'linear-gradient(135deg,#f59e0b,#d97706)',
    'linear-gradient(135deg,#ef4444,#dc2626)',
    'linear-gradient(135deg,#3b82f6,#2563eb)',
    'linear-gradient(135deg,#ec4899,#db2777)',
    'linear-gradient(135deg,#8b5cf6,#7c3aed)',
    'linear-gradient(135deg,#06b6d4,#0891b2)',
    'linear-gradient(135deg,#f97316,#ea580c)',
    'linear-gradient(135deg,#10b981,#059669)',
    'linear-gradient(135deg,#6366f1,#4f46e5)',
    'linear-gradient(135deg,#14b8a6,#0d9488)',
    'linear-gradient(135deg,#a855f7,#9333ea)',
    'linear-gradient(135deg,#f43f5e,#e11d48)',
    'linear-gradient(135deg,#0ea5e9,#0284c7)',
];

function getAppColor(id) {
    return APP_COLORS[Math.abs(id) % APP_COLORS.length];
}

function getInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
}

// ============================================================
// COMPONENT
// ============================================================

export class HomeScreen extends Component {
    static template = "web_home_enterprise.HomeScreen";
    static props = {};

    setup() {
        this.orm      = useService("orm");
        this.action   = useService("action");
        this.menu     = useService("menu");

        // Obtener datos del usuario de forma segura para Odoo 19
        // user service es la forma moderna; session es fallback
        let userService = null;
        try {
            userService = useService("user");
        } catch (_e) {
            // user service might not exist in all versions
        }

        const uid = userService?.userId || (typeof session !== 'undefined' ? session.uid : null) || false;
        const userName = userService?.name || this._getSessionProp("name") || "Usuario";
        const userLogin = userService?.login || this._getSessionProp("login") || "";
        const companyId = userService?.companyId || this._getSessionProp("company_id") || false;

        // company_name: en Odoo 19 puede estar en user_companies o no existir directamente
        let companyName = "Odoo";
        try {
            const companies = this._getSessionProp("user_companies");
            if (companies && companies.current_company) {
                companyName = companies.current_company.name || companies.current_company[1] || "Odoo";
            } else {
                companyName = this._getSessionProp("company_name") || "Odoo";
            }
        } catch (_e) {
            companyName = this._getSessionProp("company_name") || "Odoo";
        }

        this.state = useState({
            apps: [],
            filteredApps: [],
            loading: true,
            searchQuery: '',
            showUserMenu: false,
            draggingId: null,
            dragOverId: null,
            // User info
            userName,
            userEmail: userLogin,
            userAvatar: uid ? `/web/image/res.users/${uid}/avatar_128` : null,
            companyName,
            companyLogo: null,
        });

        this._uid = uid;
        this._companyId = companyId;
        this._dragSrcApp = null;
        this._userAppOrder = [];
        this._clickOutside = this._onClickOutside.bind(this);

        onMounted(async () => {
            await this._loadCompanyLogo();
            await this._loadUserInfo();
            await this._loadSettings();
            await this._loadApps();
            document.addEventListener('click', this._clickOutside, true);
        });

        onWillUnmount(() => {
            document.removeEventListener('click', this._clickOutside, true);
        });
    }

    /**
     * Acceso seguro a propiedades de session sin importar directamente
     * para evitar que un import roto quiebre todo el bundle.
     */
    _getSessionProp(prop) {
        try {
            // session se importa dinámicamente como fallback
            const mod = owl?.__session || window.__session;
            if (mod && mod[prop] !== undefined) return mod[prop];
        } catch (_e) { /* ignore */ }
        return undefined;
    }

    // ============================================================
    // GETTERS
    // ============================================================

    get greetingText()  { return getGreeting(); }
    get userFirstName() { return (this.state.userName || '').split(' ')[0] || this.state.userName; }
    get userInitials()  { return getInitials(this.state.userName); }
    get currentYear()   { return new Date().getFullYear(); }

    // ============================================================
    // INIT
    // ============================================================

    async _loadCompanyLogo() {
        try {
            if (this._companyId) {
                this.state.companyLogo = `/web/image/res.company/${this._companyId}/logo`;
            }
        } catch (_e) { /* ignore */ }
    }

    /**
     * Carga datos reales del usuario desde el controller (email, nombre, company).
     * Esto es más confiable que depender de session properties que varían entre versiones.
     */
    async _loadUserInfo() {
        try {
            const res = await fetch('/web/home/get_settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: {} }),
            });
            const data = await res.json();
            const s = data.result || {};
            if (s.user_name) this.state.userName = s.user_name;
            if (s.user_email) this.state.userEmail = s.user_email;
            if (s.company_name) this.state.companyName = s.company_name;
        } catch (_e) { /* ignore, keep defaults */ }
    }

    async _loadSettings() {
        try {
            const res = await fetch('/web/home/get_settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: {} }),
            });
            const data = await res.json();
            const s = data.result || {};
            this._userAppOrder = JSON.parse(s.app_order || '[]');
        } catch (_e) {
            this._userAppOrder = [];
        }
    }

    // ============================================================
    // LOAD APPS — múltiples estrategias para obtener iconos reales
    // ============================================================

    async _loadApps() {
        // Estrategia 1: menu service (más estable en Odoo 19)
        try {
            const menus = this.menu.getApps ? this.menu.getApps() : null;
            if (menus && menus.length) {
                const apps = menus.map(m => this._menuServiceToApp(m)).filter(Boolean);
                if (apps.length) {
                    const ordered = this._applyUserOrder(apps);
                    this.state.apps = ordered;
                    this.state.filteredApps = [...ordered];
                    this.state.loading = false;
                    return;
                }
            }
        } catch (_e) {
            console.warn('[HomeScreen] menu.getApps() not available, trying load_menus');
        }

        // Estrategia 2: load_menus RPC
        try {
            const menuData = await this.orm.call('ir.ui.menu', 'load_menus', [false]);
            if (menuData && menuData.root) {
                const apps = [];
                for (const menuId of (menuData.root.children || [])) {
                    const menu = menuData[menuId];
                    if (!menu) continue;
                    const app = this._buildAppEntry(menuId, menu);
                    if (app) apps.push(app);
                }
                if (apps.length) {
                    const ordered = this._applyUserOrder(apps);
                    this.state.apps = ordered;
                    this.state.filteredApps = [...ordered];
                    this.state.loading = false;
                    return;
                }
            }
        } catch (_e) {
            console.warn('[HomeScreen] load_menus failed, trying menu service tree');
        }

        // Estrategia 3: menu service tree (fallback legacy)
        try {
            const menuData = this.menu.getMenuAsTree
                ? this.menu.getMenuAsTree("root")
                : null;
            if (menuData) {
                const apps = this._processMenuTree(menuData);
                if (apps.length) {
                    const ordered = this._applyUserOrder(apps);
                    this.state.apps = ordered;
                    this.state.filteredApps = [...ordered];
                    this.state.loading = false;
                    return;
                }
            }
        } catch (_e) {
            console.warn('[HomeScreen] all menu strategies failed');
        }

        this.state.loading = false;
    }

    /**
     * Convierte un item de menu.getApps() a nuestro formato de app.
     */
    _menuServiceToApp(menu) {
        if (!menu || !menu.id) return null;
        let iconUrl = null;
        let iconData = null;

        if (menu.webIconData) {
            iconData = menu.webIconData;
        } else if (menu.webIcon) {
            iconUrl = this._resolveWebIcon(menu.id, menu.webIcon);
        }

        if (!iconData && !iconUrl) {
            iconUrl = `/web/image/ir.ui.menu/${menu.id}/web_icon_data`;
        }

        return {
            id: menu.id,
            name: menu.label || menu.name || '',
            xmlid: menu.xmlid || '',
            actionId: menu.actionID || menu.action || null,
            webIcon: menu.webIcon || null,
            iconUrl,
            iconData,
            faIcon: this._getFaIcon(menu.webIcon),
            color: getAppColor(menu.id),
            initials: getInitials(menu.label || menu.name || ''),
        };
    }

    _buildAppEntry(menuId, menu) {
        const hasIcon = menu.web_icon || menu.web_icon_data;
        const hasChildren = menu.children && menu.children.length > 0;
        if (!hasIcon && !hasChildren && !menu.action) return null;

        let iconUrl = null;
        let iconData = null;

        if (menu.web_icon_data) {
            iconData = menu.web_icon_data;
        } else if (menu.web_icon) {
            iconUrl = this._resolveWebIcon(menuId, menu.web_icon);
        }

        if (!iconData && !iconUrl) {
            iconUrl = `/web/image/ir.ui.menu/${menuId}/web_icon_data`;
        }

        return {
            id: menuId,
            name: menu.name,
            xmlid: menu.xmlid || '',
            actionId: menu.action || null,
            webIcon: menu.web_icon || null,
            iconUrl,
            iconData,
            faIcon: this._getFaIcon(menu.web_icon),
            color: getAppColor(menuId),
            initials: getInitials(menu.name),
        };
    }

    /**
     * Resuelve web_icon string a URL usable.
     */
    _resolveWebIcon(menuId, webIcon) {
        if (!webIcon) return null;
        const parts = webIcon.split(',');
        if (parts.length === 2) {
            const [mod, icon] = parts.map(p => p.trim());
            if (icon.startsWith('fa-')) return null; // Font Awesome, no URL
            if (icon.startsWith('/')) return icon;    // Ruta absoluta
            return `/${mod}/static/description/${icon}`;
        }
        if (webIcon.startsWith('/') || webIcon.startsWith('http')) return webIcon;
        return null;
    }

    _getFaIcon(webIcon) {
        if (!webIcon) return null;
        const parts = webIcon.split(',');
        if (parts.length === 2) {
            const icon = parts[1].trim();
            if (icon.startsWith('fa-')) return icon;
        }
        return null;
    }

    _processMenuTree(menuTree) {
        const children = menuTree.childrenTree || menuTree.children || [];
        const apps = [];
        for (const menu of children) {
            if (!menu.id) continue;
            const iconUrl = menu.webIconData
                ? null
                : `/web/image/ir.ui.menu/${menu.id}/web_icon_data`;
            apps.push({
                id: menu.id,
                name: menu.name,
                xmlid: menu.xmlid || '',
                iconUrl,
                iconData: menu.webIconData || null,
                faIcon: null,
                color: getAppColor(menu.id),
                initials: getInitials(menu.name),
            });
        }
        return apps;
    }

    _applyUserOrder(apps) {
        const order = this._userAppOrder || [];
        if (!order.length) return apps;
        const byId    = {};
        const byXmlid = {};
        for (const app of apps) {
            byId[String(app.id)] = app;
            if (app.xmlid) byXmlid[app.xmlid] = app;
        }
        const placed = new Set();
        const ordered = [];
        for (const key of order) {
            const app = byId[String(key)] || byXmlid[String(key)];
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
        this.state.filteredApps = q
            ? this.state.apps.filter(a => a.name.toLowerCase().includes(q))
            : [...this.state.apps];
    }

    clearSearch() {
        this.state.searchQuery = '';
        this.state.filteredApps = [...this.state.apps];
    }

    // ============================================================
    // NAVIGATION — abre la app a través del menu service
    // ============================================================

    openApp(ev, app) {
        ev.stopPropagation();

        // Odoo 19: selectMenu es el método estándar
        if (typeof this.menu.selectMenu === 'function') {
            try {
                this.menu.selectMenu(app.id);
                return;
            } catch (_e) { /* fallback */ }
        }

        // Odoo 18/legacy: otros métodos posibles
        const fallbackMethods = ['selectAppMenu', 'setCurrentMenu'];
        for (const method of fallbackMethods) {
            if (typeof this.menu[method] === 'function') {
                try {
                    this.menu[method](app.id);
                    return;
                } catch (_e) { /* siguiente */ }
            }
        }

        // Fallback final: navegar por URL o action
        if (app.xmlid) {
            window.location.href = `/odoo/${app.xmlid.replace('.', '/')}`;
        } else if (app.actionId) {
            this.action.doAction(app.actionId);
        }
    }

    onIconError(ev, app) {
        ev.target.style.display = 'none';
        app.iconUrl = null;
        app.iconData = null;
    }

    // ============================================================
    // HAMBURGER → abre menú lateral nativo de Odoo
    // ============================================================

    openNativeMenu() {
        // Odoo 19 puede usar distintos selectores para el hamburger
        const selectors = [
            '.o_menu_toggle',
            '.o_main_navbar .o_menu_toggle',
            'button.o_menu_toggle',
            '.o_navbar_apps_menu button',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                el.click();
                return;
            }
        }
        document.dispatchEvent(new CustomEvent('toggle-home-menu', { bubbles: true }));
    }

    // ============================================================
    // USER MENU
    // ============================================================

    toggleUserMenu() {
        this.state.showUserMenu = !this.state.showUserMenu;
    }

    _onClickOutside(ev) {
        if (!this.state.showUserMenu) return;
        const dropdown = document.querySelector('.o_home_user_dropdown');
        const trigger  = document.querySelector('.o_home_user_menu');
        if (
            dropdown && trigger &&
            !dropdown.contains(ev.target) &&
            !trigger.contains(ev.target)
        ) {
            this.state.showUserMenu = false;
        }
    }

    openPreferences() {
        this.state.showUserMenu = false;
        this.action.doAction({
            type: 'ir.actions.act_window',
            res_model: 'res.users',
            res_id: this._uid,
            views: [[false, 'form']],
            view_mode: 'form',
            target: 'new',
            flags: { action_buttons: true, headless: false },
            context: { no_breadcrumbs: true },
        });
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

    onDragLeave() { this.state.dragOverId = null; }

    onDrop(ev, targetApp) {
        ev.preventDefault();
        if (!this._dragSrcApp || this._dragSrcApp.id === targetApp.id) return;
        const apps = [...this.state.apps];
        const si = apps.findIndex(a => a.id === this._dragSrcApp.id);
        const ti = apps.findIndex(a => a.id === targetApp.id);
        if (si === -1 || ti === -1) return;
        const [moved] = apps.splice(si, 1);
        apps.splice(ti, 0, moved);
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
            const order = apps.map(a => a.xmlid || a.id);
            await fetch('/web/home/save_app_order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'call', id: 1,
                    params: { order_json: JSON.stringify(order) }
                }),
            });
        } catch (_e) {
            console.warn('[HomeScreen] Could not save app order');
        }
    }
}

// Registrar como acción cliente
registry.category("actions").add("web_home_enterprise.HomeScreen", HomeScreen);