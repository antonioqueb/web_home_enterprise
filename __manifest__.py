# -*- coding: utf-8 -*-
{
    'name': 'Enterprise Home Screen',
    'version': '19.0.2.0.0',
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
}