## ./__init__.py
```py
# -*- coding: utf-8 -*-
from . import models
from . import controllers
```

## ./__manifest__.py
```py
# -*- coding: utf-8 -*-
{
    'name': 'Enterprise Home Screen',
    'version': '19.0.3.0.0',
    'category': 'Web',
    'summary': 'Premium home screen for Odoo Community Edition',
    'author': 'Alphaqueb Consulting',
    'website': 'https://alphaqueb.com',
    'license': 'LGPL-3',
    'depends': ['web', 'base_setup'],
    'data': [
        'security/ir.model.access.csv',
        'views/home_screen_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'web_home_enterprise/static/src/css/home_screen.css',
            'web_home_enterprise/static/src/xml/home_screen.xml',
            'web_home_enterprise/static/src/js/home_screen.js',
            'web_home_enterprise/static/src/js/home_integration.js',
        ],
    },
    'installable': True,
    'auto_install': False,
    'application': False,
}```

## ./controllers/__init__.py
```py
# -*- coding: utf-8 -*-
from . import main
```

## ./controllers/main.py
```py
# -*- coding: utf-8 -*-
import json
from odoo import http
from odoo.http import request


class HomeScreenController(http.Controller):

    @http.route('/web/home/get_settings', type='json', auth='user')
    def get_home_settings(self):
        ICP = request.env['ir.config_parameter'].sudo()
        user_settings = request.env['web.home.user.settings'].get_user_settings()

        # Datos reales del usuario
        user = request.env.user
        partner = user.partner_id

        return {
            'background_type': ICP.get_param('web_home_enterprise.background_type', 'gradient'),
            'background_color': ICP.get_param('web_home_enterprise.background_color', '#0a0a0f'),
            'background_image_url': ICP.get_param('web_home_enterprise.background_image_url', ''),
            'app_order': user_settings.get('app_order', '[]'),
            'user_name': user.name or '',
            'user_email': partner.email or user.login or '',
            'company_name': user.company_id.name or '',
        }

    @http.route('/web/home/save_app_order', type='json', auth='user')
    def save_app_order(self, order_json):
        request.env['web.home.user.settings'].save_app_order(order_json)
        return {'success': True}```

## ./models/__init__.py
```py
# -*- coding: utf-8 -*-
from . import home_user_settings```

## ./models/home_user_settings.py
```py
# -*- coding: utf-8 -*-
from odoo import api, fields, models


class HomeUserSettings(models.Model):
    _name = 'web.home.user.settings'
    _description = 'Home Screen User Settings'
    _rec_name = 'user_id'

    user_id = fields.Many2one(
        'res.users',
        string='User',
        required=True,
        ondelete='cascade',
        default=lambda self: self.env.user,
    )
    app_order = fields.Text(
        string='App Order (JSON)',
        default='[]',
        help='JSON array of app xmlids in user-defined order',
    )

    _sql_constraints = [
        ('user_unique', 'UNIQUE(user_id)', 'Only one settings record per user'),
    ]

    @api.model
    def get_user_settings(self):
        settings = self.search([('user_id', '=', self.env.uid)], limit=1)
        if not settings:
            settings = self.create({'user_id': self.env.uid})
        return {
            'app_order': settings.app_order or '[]',
        }

    @api.model
    def save_app_order(self, order_json):
        settings = self.search([('user_id', '=', self.env.uid)], limit=1)
        if not settings:
            settings = self.create({'user_id': self.env.uid})
        settings.write({'app_order': order_json})
        return True
```

## ./models/res_config_settings.py
```py
# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    home_background_type = fields.Selection(
        selection=[
            ('gradient', 'Gradient'),
            ('solid', 'Solid Color'),
            ('image', 'Custom Image'),
        ],
        string='Background Type',
        default='gradient',
        config_parameter='web_home_enterprise.background_type',
    )
    home_background_color = fields.Char(
        string='Background Color',
        default='#6C2EB9',
        config_parameter='web_home_enterprise.background_color',
    )
    home_background_image = fields.Binary(
        string='Background Image',
        attachment=True,
    )
    home_background_image_url = fields.Char(
        string='Background Image URL',
        config_parameter='web_home_enterprise.background_image_url',
    )

    def set_values(self):
        super().set_values()
        if self.home_background_image:
            import base64
            attachment = self.env['ir.attachment'].sudo().search([
                ('res_model', '=', 'res.config.settings'),
                ('res_field', '=', 'home_background_image'),
            ], limit=1)
            if attachment:
                url = '/web/image/%d' % attachment.id
                self.env['ir.config_parameter'].sudo().set_param(
                    'web_home_enterprise.background_image_url', url
                )

    def get_values(self):
        res = super().get_values()
        ICP = self.env['ir.config_parameter'].sudo()
        res.update(
            home_background_type=ICP.get_param('web_home_enterprise.background_type', 'gradient'),
            home_background_color=ICP.get_param('web_home_enterprise.background_color', '#6C2EB9'),
            home_background_image_url=ICP.get_param('web_home_enterprise.background_image_url', ''),
        )
        return res
```

## ./static/src/js/home_integration.js
```js
/** @odoo-module **/

/**
 * home_integration.js
 *
 * Servicio que integra el HomeScreen con la navbar nativa de Odoo:
 * - El logo / brand de la navbar abre el HomeScreen
 * - Al navegar desde el Home a una app, puedes regresar con el mismo elemento
 */

import { registry } from "@web/core/registry";

const homeIntegrationService = {
    dependencies: ["action"],

    start(env, { action: actionService }) {
        const HOME_ACTION = "web_home_enterprise.action_home_screen";

        function navigateHome() {
            actionService.doAction(HOME_ACTION, { clearBreadcrumbs: true });
        }

        function attachHomeListeners() {
            // Selectores del logo/brand en Odoo 19 Community
            const selectors = [
                '.o_menu_brand',
                '.o_main_navbar .o_logo',
                '.o_main_navbar [class*="logo"]',
                '.o_nav_entry.o_home_menu_toggler',
            ];

            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => {
                    if (!el.dataset.homeAttached) {
                        el.dataset.homeAttached = '1';
                        el.addEventListener('click', (ev) => {
                            // No interceptar si ya estamos en el Home
                            if (document.querySelector('.o_home_enterprise_screen')) return;
                            ev.preventDefault();
                            ev.stopPropagation();
                            navigateHome();
                        }, true);
                    }
                });
            }
        }

        // Observer para detectar cuando la navbar aparece en el DOM
        const observer = new MutationObserver(attachHomeListeners);
        observer.observe(document.body, { childList: true, subtree: false });
        setTimeout(() => {
            observer.disconnect();
            attachHomeListeners();
        }, 5000);

        attachHomeListeners();

        // Evento custom que el HomeScreen puede disparar si necesita
        document.addEventListener('home:navigate', navigateHome);

        return { navigateHome };
    },
};

registry.category("services").add("web_home_integration", homeIntegrationService);```

## ./static/src/js/home_screen.js
```js
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
registry.category("actions").add("web_home_enterprise.HomeScreen", HomeScreen);```

## ./static/src/xml/home_screen.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">

    <t t-name="web_home_enterprise.HomeScreen">
        <div class="o_home_enterprise_screen">

            <!-- ================================================
                 NAVBAR
            ================================================ -->
            <nav class="o_home_navbar">
                <!-- Brand -->
                <div class="o_home_navbar_brand">
                    <img t-if="state.companyLogo"
                         t-att-src="state.companyLogo"
                         class="o_home_company_logo"
                         alt="Logo"
                         t-on-error="(ev) => ev.target.style.display='none'"/>
                    <span class="o_home_company_name" t-esc="state.companyName"/>
                </div>

                <!-- Search -->
                <div class="o_home_navbar_center">
                    <div class="o_home_search_wrapper">
                        <i class="fa fa-search o_home_search_icon"/>
                        <input
                            type="text"
                            class="o_home_search_input"
                            placeholder="Buscar aplicaciones..."
                            t-att-value="state.searchQuery"
                            t-on-input="onSearchInput"
                            autocomplete="off"
                            spellcheck="false"
                        />
                        <span t-if="state.searchQuery"
                              class="o_home_search_clear"
                              t-on-click="clearSearch">
                            <i class="fa fa-times"/>
                        </span>
                    </div>
                </div>

                <!-- Right -->
                <div class="o_home_navbar_right">
                    <!-- User menu trigger -->
                    <div class="o_home_user_menu"
                         t-att-class="{'open': state.showUserMenu}"
                         t-on-click="toggleUserMenu">
                        <img t-if="state.userAvatar"
                             t-att-src="state.userAvatar"
                             class="o_home_user_avatar"
                             alt="Avatar"
                             t-on-error="(ev) => ev.target.style.display='none'"/>
                        <div t-else="" class="o_home_user_avatar_placeholder">
                            <t t-esc="userInitials"/>
                        </div>
                        <span class="o_home_username" t-esc="userFirstName"/>
                        <i class="fa fa-chevron-down o_home_chevron"/>
                    </div>

                    <!-- Dropdown -->
                    <div class="o_home_user_dropdown" t-if="state.showUserMenu">
                        <div class="o_home_user_dropdown_header">
                            <img t-if="state.userAvatar"
                                 t-att-src="state.userAvatar"
                                 class="o_home_dropdown_avatar"
                                 alt="Avatar"
                                 t-on-error="(ev) => ev.target.style.display='none'"/>
                            <div t-else="" class="o_home_dropdown_avatar_placeholder">
                                <t t-esc="userInitials"/>
                            </div>
                            <div class="o_home_dropdown_user_info">
                                <span class="o_home_dropdown_name" t-esc="state.userName"/>
                                <span class="o_home_dropdown_email" t-esc="state.userEmail"/>
                            </div>
                        </div>
                        <div class="o_home_user_dropdown_divider"/>
                        <a class="o_home_dropdown_item" t-on-click="openPreferences">
                            <i class="fa fa-sliders"/> Preferencias
                        </a>
                        <a class="o_home_dropdown_item" t-on-click="openSettings">
                            <i class="fa fa-cog"/> Configuración
                        </a>
                        <div class="o_home_user_dropdown_divider"/>
                        <a class="o_home_dropdown_item o_home_dropdown_logout" t-on-click="onLogout">
                            <i class="fa fa-sign-out"/> Cerrar sesión
                        </a>
                    </div>
                </div>
            </nav>

            <!-- ================================================
                 MAIN
            ================================================ -->
            <main class="o_home_main">
                <!-- Greeting -->
                <div class="o_home_greeting">
                    <h1 class="o_home_greeting_title">
                        <t t-esc="greetingText"/>,&#32;
                        <span class="o_home_greeting_name" t-esc="userFirstName"/>
                    </h1>
                    <p class="o_home_greeting_subtitle">¿En qué quieres trabajar hoy?</p>
                </div>

                <!-- Apps -->
                <div class="o_home_apps_container">
                    <t t-if="state.loading">
                        <div class="o_home_loading">
                            <div class="o_home_spinner"/>
                            <p>Cargando aplicaciones…</p>
                        </div>
                    </t>
                    <t t-elif="state.filteredApps.length === 0">
                        <div class="o_home_no_results">
                            <i class="fa fa-search fa-3x"/>
                            <p>Sin resultados para "<t t-esc="state.searchQuery"/>"</p>
                        </div>
                    </t>
                    <t t-else="">
                        <div class="o_home_apps_grid">
                            <t t-foreach="state.filteredApps" t-as="app" t-key="app.id">
                                <div class="o_home_app_card"
                                     t-att-class="{
                                         o_home_app_dragging:  state.draggingId  === app.id,
                                         o_home_app_drag_over: state.dragOverId  === app.id
                                     }"
                                     t-att-draggable="!state.searchQuery ? 'true' : 'false'"
                                     t-on-dragstart="(ev) => this.onDragStart(ev, app)"
                                     t-on-dragover="(ev) => this.onDragOver(ev, app)"
                                     t-on-dragleave="onDragLeave"
                                     t-on-drop="(ev) => this.onDrop(ev, app)"
                                     t-on-dragend="onDragEnd"
                                     t-on-click="(ev) => this.openApp(ev, app)">

                                    <!-- Icon -->
                                    <div class="o_home_app_icon_wrapper">
                                        <!-- Base64 directo (más confiable) -->
                                        <t t-if="app.iconData">
                                            <img t-att-src="'data:image/png;base64,' + app.iconData"
                                                 class="o_home_app_icon"
                                                 t-att-alt="app.name"
                                                 t-on-error="(ev) => this.onIconError(ev, app)"/>
                                        </t>
                                        <!-- URL del icono -->
                                        <t t-elif="app.iconUrl">
                                            <img t-att-src="app.iconUrl"
                                                 class="o_home_app_icon"
                                                 t-att-alt="app.name"
                                                 t-on-error="(ev) => this.onIconError(ev, app)"/>
                                        </t>
                                        <!-- Font Awesome icon -->
                                        <t t-elif="app.faIcon">
                                            <div class="o_home_app_icon_fallback"
                                                 t-att-style="'background:' + app.color">
                                                <i t-att-class="'fa ' + app.faIcon" style="font-size:28px; color:rgba(255,255,255,0.9)"/>
                                            </div>
                                        </t>
                                        <!-- Fallback con iniciales -->
                                        <t t-else="">
                                            <div class="o_home_app_icon_fallback"
                                                 t-att-style="'background:' + app.color">
                                                <t t-esc="app.initials"/>
                                            </div>
                                        </t>
                                    </div>

                                    <span class="o_home_app_name" t-esc="app.name"/>

                                    <div t-if="!state.searchQuery" class="o_home_app_drag_hint">
                                        <i class="fa fa-arrows-alt"/>
                                    </div>
                                </div>
                            </t>
                        </div>
                    </t>
                </div>
            </main>

            <!-- ================================================
                 FOOTER
            ================================================ -->
            <footer class="o_home_footer">
                <span>Powered by <strong>Odoo Community</strong></span>
                <span class="o_home_footer_sep">·</span>
                <span t-esc="currentYear"/>
                <span class="o_home_footer_sep">·</span>
                <a class="o_home_footer_link" t-on-click="openSettings">
                    Personalizar pantalla de inicio
                </a>
            </footer>

            <!-- Click outside overlay -->
            <div t-if="state.showUserMenu"
                 class="o_home_overlay"
                 t-on-click="() => { this.state.showUserMenu = false; }"/>
        </div>
    </t>

</templates>```

## ./views/home_screen_views.xml
```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <!--
        Acción cliente del HomeScreen.
        NO creamos ir.ui.menu con parent_id vacío para que NO aparezca
        como app en el menú de aplicaciones de Odoo.
    -->
    <record id="action_home_screen" model="ir.actions.client">
        <field name="name">Inicio</field>
        <field name="tag">web_home_enterprise.HomeScreen</field>
        <field name="target">main</field>
    </record>
</odoo>```

## ./views/res_config_settings_views.xml
```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="res_config_settings_view_home" model="ir.ui.view">
        <field name="name">res.config.settings.view.home</field>
        <field name="model">res.config.settings</field>
        <field name="inherit_id" ref="base_setup.res_config_settings_view_form"/>
        <field name="arch" type="xml">
            <xpath expr="//form" position="inside">
                <app string="Home Screen" name="web_home_enterprise">
                    <block title="Background">
                        <setting string="Background Type">
                            <field name="home_background_type" widget="radio"/>
                        </setting>
                        <setting string="Background Color"
                                 invisible="home_background_type != 'solid'">
                            <field name="home_background_color"/>
                        </setting>
                        <setting string="Background Image"
                                 invisible="home_background_type != 'image'">
                            <field name="home_background_image" widget="image"/>
                        </setting>
                    </block>
                </app>
            </xpath>
        </field>
    </record>
</odoo>```

