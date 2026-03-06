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
        return {'success': True}