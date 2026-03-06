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
    'version': '19.0.1.0.0',
    'category': 'Web',
    'summary': 'Enterprise-style home screen for Odoo Community Edition',
    'author': 'Alphaqueb Consulting',
    'website': 'https://alphaqueb.com',
    'license': 'LGPL-3',
    'depends': ['web'],
    'data': [
        'security/ir.model.access.csv',
        'views/home_screen_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'web_home_enterprise/static/src/css/home_screen.css',
            'web_home_enterprise/static/src/xml/home_screen.xml',
            'web_home_enterprise/static/src/js/home_screen.js',
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
        return {
            'background_type': ICP.get_param('web_home_enterprise.background_type', 'gradient'),
            'background_color': ICP.get_param('web_home_enterprise.background_color', '#6C2EB9'),
            'background_image_url': ICP.get_param('web_home_enterprise.background_image_url', ''),
            'app_order': user_settings.get('app_order', '[]'),
        }

    @http.route('/web/home/save_app_order', type='json', auth='user')
    def save_app_order(self, order_json):
        request.env['web.home.user.settings'].save_app_order(order_json)
        return {'success': True}
```

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

## ./static/src/js/home_screen.js
```js
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
        if (!menuData || !menuData.root) return [];
        const apps = [];
        const rootChildren = menuData.root.children || [];
        for (const menuId of rootChildren) {
            const menu = menuData[menuId];
            if (!menu) continue;
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
        for (const app of apps) {
            if (!placed.has(app.id)) ordered.push(app);
        }
        return ordered;
    }

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

    openApp(ev, app) {
        if (app.action) {
            this.action.doAction(app.action);
        } else {
            this.action.doAction({
                type: 'ir.actions.act_url',
                url: `/odoo/${app.xmlid || app.id}`,
                target: 'self',
            }).catch(() => {
                const event = new CustomEvent('menu-clicked', { detail: { id: app.id } });
                document.dispatchEvent(event);
            });
        }
    }

    onIconError(ev, app) {
        ev.target.style.display = 'none';
        app.web_icon = null;
        app.web_icon_data = null;
    }

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

registry.category("actions").add("web_home_enterprise.HomeScreen", HomeScreen);```

## ./static/src/xml/home_screen.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">

    <t t-name="web_home_enterprise.HomeScreen">
        <div class="o_home_enterprise_screen" t-att-style="state.backgroundStyle">
            <div class="o_home_navbar">
                <div class="o_home_navbar_brand">
                    <img t-if="state.companyLogo" t-att-src="state.companyLogo" class="o_home_company_logo" alt="Company"/>
                    <span class="o_home_company_name" t-esc="state.companyName"/>
                </div>
                <div class="o_home_navbar_center">
                    <div class="o_home_search_wrapper">
                        <i class="fa fa-search o_home_search_icon"/>
                        <input
                            type="text"
                            class="o_home_search_input"
                            placeholder="Search apps..."
                            t-att-value="state.searchQuery"
                            t-on-input="onSearchInput"
                        />
                        <span t-if="state.searchQuery" class="o_home_search_clear" t-on-click="clearSearch">
                            <i class="fa fa-times"/>
                        </span>
                    </div>
                </div>
                <div class="o_home_navbar_right">
                    <div class="o_home_user_menu" t-on-click="toggleUserMenu">
                        <img t-if="state.userAvatar" t-att-src="state.userAvatar" class="o_home_user_avatar" alt="User"/>
                        <div t-else="" class="o_home_user_avatar_placeholder">
                            <t t-esc="userInitials"/>
                        </div>
                        <span class="o_home_username" t-esc="state.userName"/>
                        <i class="fa fa-chevron-down o_home_chevron"/>
                    </div>
                    <div class="o_home_user_dropdown" t-if="state.showUserMenu">
                        <div class="o_home_user_dropdown_header">
                            <img t-if="state.userAvatar" t-att-src="state.userAvatar" class="o_home_dropdown_avatar" alt="User"/>
                            <div class="o_home_dropdown_user_info">
                                <span class="o_home_dropdown_name" t-esc="state.userName"/>
                                <span class="o_home_dropdown_email" t-esc="state.userEmail"/>
                            </div>
                        </div>
                        <div class="o_home_user_dropdown_divider"/>
                        <a class="o_home_dropdown_item" t-on-click="openPreferences">
                            <i class="fa fa-cog"/> Preferences
                        </a>
                        <a class="o_home_dropdown_item" t-on-click="openSettings">
                            <i class="fa fa-sliders"/> Settings
                        </a>
                        <div class="o_home_user_dropdown_divider"/>
                        <a class="o_home_dropdown_item o_home_dropdown_logout" t-on-click="onLogout">
                            <i class="fa fa-sign-out"/> Log out
                        </a>
                    </div>
                </div>
            </div>

            <div class="o_home_main">
                <div class="o_home_greeting">
                    <h1 class="o_home_greeting_title">
                        <t t-esc="greetingText"/>, <span class="o_home_greeting_name" t-esc="userFirstName"/>
                    </h1>
                    <p class="o_home_greeting_subtitle">What would you like to work on today?</p>
                </div>

                <div class="o_home_apps_container">
                    <t t-if="state.loading">
                        <div class="o_home_loading">
                            <div class="o_home_spinner"/>
                            <p>Loading applications...</p>
                        </div>
                    </t>
                    <t t-else="">
                        <t t-if="state.filteredApps.length === 0">
                            <div class="o_home_no_results">
                                <i class="fa fa-search fa-3x"/>
                                <p>No apps found for "<t t-esc="state.searchQuery"/>"</p>
                            </div>
                        </t>
                        <div t-else="" class="o_home_apps_grid" t-ref="appsGrid">
                            <t t-foreach="state.filteredApps" t-as="app" t-key="app.id">
                                <div
                                    class="o_home_app_card"
                                    t-att-data-app-id="app.id"
                                    t-att-class="{o_home_app_dragging: state.draggingId === app.id, o_home_app_drag_over: state.dragOverId === app.id}"
                                    t-att-draggable="!state.searchQuery ? 'true' : 'false'"
                                    t-on-dragstart="(ev) => this.onDragStart(ev, app)"
                                    t-on-dragover="(ev) => this.onDragOver(ev, app)"
                                    t-on-dragleave="onDragLeave"
                                    t-on-drop="(ev) => this.onDrop(ev, app)"
                                    t-on-dragend="onDragEnd"
                                    t-on-click="(ev) => this.openApp(ev, app)"
                                >
                                    <div class="o_home_app_icon_wrapper">
                                        <t t-if="app.web_icon_data">
                                            <img
                                                t-att-src="'data:image/png;base64,' + app.web_icon_data"
                                                class="o_home_app_icon"
                                                t-att-alt="app.name"
                                            />
                                        </t>
                                        <t t-elif="app.web_icon">
                                            <img
                                                t-att-src="'/web/image/ir.ui.menu/' + app.id + '/web_icon'"
                                                class="o_home_app_icon"
                                                t-att-alt="app.name"
                                                t-on-error="(ev) => this.onIconError(ev, app)"
                                            />
                                        </t>
                                        <t t-else="">
                                            <div class="o_home_app_icon_fallback" t-att-style="'background-color:' + app.color">
                                                <span t-esc="app.initials"/>
                                            </div>
                                        </t>
                                    </div>
                                    <span class="o_home_app_name" t-esc="app.name"/>
                                    <div t-if="!state.searchQuery" class="o_home_app_drag_hint">
                                        <i class="fa fa-arrows"/>
                                    </div>
                                </div>
                            </t>
                        </div>
                    </t>
                </div>
            </div>

            <div class="o_home_footer">
                <span>Powered by <strong>Odoo Community</strong></span>
                <span class="o_home_footer_sep">·</span>
                <span t-esc="currentYear"/>
                <span class="o_home_footer_sep">·</span>
                <a t-on-click="openSettings" class="o_home_footer_link">Customize Home Screen</a>
            </div>

            <div t-if="state.showUserMenu" class="o_home_overlay" t-on-click="closeUserMenu"/>
        </div>
    </t>

</templates>```

## ./views/home_screen_views.xml
```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="action_home_screen" model="ir.actions.client">
        <field name="name">Home</field>
        <field name="tag">web_home_enterprise.HomeScreen</field>
    </record>

    <record id="menu_home_screen" model="ir.ui.menu">
        <field name="name">Home</field>
        <field name="action" ref="action_home_screen"/>
        <field name="sequence">1</field>
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

