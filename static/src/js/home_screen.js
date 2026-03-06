/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";

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

    setup() {
        this.orm      = useService("orm");
        this.action   = useService("action");
        this.menu     = useService("menu");

        this.state = useState({
            apps: [],
            filteredApps: [],
            loading: true,
            searchQuery: '',
            showUserMenu: false,
            draggingId: null,
            dragOverId: null,
            // User info
            userName:    session.name || 'Usuario',
            userEmail:   session.partner_display_name || '',
            userAvatar:  session.uid ? `/web/image/res.users/${session.uid}/avatar_128` : null,
            companyName: session.company_name || 'Odoo',
            companyLogo: null,
        });

        this._dragSrcApp = null;
        this._userAppOrder = [];
        this._clickOutside = this._onClickOutside.bind(this);

        onMounted(async () => {
            await this._loadCompanyLogo();
            await this._loadSettings();
            await this._loadApps();
            document.addEventListener('click', this._clickOutside, true);
        });

        onWillUnmount(() => {
            document.removeEventListener('click', this._clickOutside, true);
        });
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
            const cid = session.company_id;
            if (cid) {
                this.state.companyLogo = `/web/image/res.company/${cid}/logo`;
            }
        } catch (e) { /* ignore */ }
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
        } catch (e) {
            this._userAppOrder = [];
        }
    }

    // ============================================================
    // LOAD APPS — múltiples estrategias para obtener iconos reales
    // ============================================================

    async _loadApps() {
        try {
            // Estrategia 1: load_menus que devuelve toda la data incluyendo web_icon_data
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
        } catch (e) {
            console.warn('[HomeScreen] load_menus failed, trying menu service', e);
        }

        // Estrategia 2: menu service tree
        try {
            const menuData = this.menu.getMenuAsTree("root");
            const apps = this._processMenuTree(menuData);
            if (apps.length) {
                const ordered = this._applyUserOrder(apps);
                this.state.apps = ordered;
                this.state.filteredApps = [...ordered];
                this.state.loading = false;
                return;
            }
        } catch (e) {
            console.warn('[HomeScreen] menu service failed', e);
        }

        this.state.loading = false;
    }

    _buildAppEntry(menuId, menu) {
        // Saltar entradas que no sean apps (sin web_icon y sin hijos y sin action)
        const hasIcon = menu.web_icon || menu.web_icon_data;
        const hasChildren = menu.children && menu.children.length > 0;
        if (!hasIcon && !hasChildren && !menu.action) return null;

        // Construir URL del ícono de la forma más confiable posible en Odoo 19
        let iconUrl = null;
        let iconData = null;

        if (menu.web_icon_data) {
            // Base64 directo
            iconData = menu.web_icon_data;
        } else if (menu.web_icon) {
            // Puede ser "module,fa-icon" o "module,path" o simplemente una URL
            const parts = menu.web_icon.split(',');
            if (parts.length === 2) {
                const [mod, icon] = parts.map(p => p.trim());
                if (icon.startsWith('fa-')) {
                    // Font awesome — sin imagen, usamos fallback con color
                    iconUrl = null;
                } else if (icon.startsWith('/')) {
                    iconUrl = icon;
                } else if (icon) {
                    iconUrl = `/${mod}/static/description/${icon}`;
                }
            } else if (menu.web_icon.startsWith('/') || menu.web_icon.startsWith('http')) {
                iconUrl = menu.web_icon;
            }
        }

        // Si no tenemos data ni url, intentamos el endpoint de imagen del menú
        if (!iconData && !iconUrl) {
            iconUrl = `/web/image/ir.ui.menu/${menuId}/web_icon`;
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
                : `/web/image/ir.ui.menu/${menu.id}/web_icon`;
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
        // Intentar con menu service primero
        const menuMethods = ['selectMenu', 'selectAppMenu', 'toggleMenu'];
        for (const method of menuMethods) {
            if (typeof this.menu[method] === 'function') {
                try {
                    this.menu[method](app.id);
                    return;
                } catch (e) {
                    // siguiente método
                }
            }
        }
        // Fallback: navegar directamente al xmlid
        if (app.xmlid) {
            window.location.href = `/odoo/${app.xmlid.replace('.', '/')}`;
        } else if (app.actionId) {
            this.action.doAction(app.actionId);
        }
    }

    onIconError(ev, app) {
        // Si falla el icono, quitarlo para usar fallback
        ev.target.style.display = 'none';
        app.iconUrl = null;
        app.iconData = null;
    }

    // ============================================================
    // HAMBURGER → abre menú lateral nativo de Odoo
    // ============================================================

    openNativeMenu() {
        // El botón hamburguesa de Odoo es .o_menu_toggle o .o_main_navbar .o_menu_brand
        const hamburger = document.querySelector(
            '.o_menu_toggle, .o_main_navbar .o_menu_toggle, button.o_menu_toggle'
        );
        if (hamburger) {
            hamburger.click();
            return;
        }
        // Alternativa: disparar evento que el shell de Odoo escucha
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
        // Abre el formulario de preferencias del usuario actual
        this.action.doAction({
            type: 'ir.actions.act_window',
            res_model: 'res.users',
            res_id: session.uid,
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
        } catch (e) {
            console.warn('[HomeScreen] Could not save app order', e);
        }
    }
}

// Registrar como acción cliente (no como menú raíz)
registry.category("actions").add("web_home_enterprise.HomeScreen", HomeScreen);