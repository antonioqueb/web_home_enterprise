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
