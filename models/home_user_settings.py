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
