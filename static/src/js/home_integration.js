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

registry.category("services").add("web_home_integration", homeIntegrationService);