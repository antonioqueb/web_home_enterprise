/** @odoo-module **/

/**
 * home_integration.js
 *
 * Servicio que integra el HomeScreen con la navbar nativa de Odoo 19:
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
            // Selectores compatibles con Odoo 19 Community
            // Odoo 19 reestructuró la navbar, estos selectores cubren ambas versiones
            const selectors = [
                '.o_menu_brand',
                '.o_main_navbar .o_logo',
                '.o_main_navbar [class*="logo"]',
                '.o_nav_entry.o_home_menu_toggler',
                // Odoo 19 nuevos selectores posibles
                '.o_navbar .o_menu_brand',
                '.o_navbar_brand',
                'a.o_menu_brand',
                '.o_action_manager ~ .o_main_navbar .o_menu_brand',
            ];

            for (const sel of selectors) {
                try {
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
                } catch (_e) {
                    // selector inválido en algún navegador, ignorar
                }
            }
        }

        // Observer con subtree: true para capturar la navbar que se renderiza
        // profundamente en el DOM (no como hijo directo de body)
        const observer = new MutationObserver(() => {
            attachHomeListeners();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Desconectar después de un tiempo razonable para no impactar performance
        setTimeout(() => {
            observer.disconnect();
            // Una última pasada
            attachHomeListeners();
        }, 10000);

        // Pasada inicial
        attachHomeListeners();

        // Re-attach después de navegaciones SPA (Odoo 19 usa router interno)
        env.bus?.addEventListener?.("ACTION_MANAGER:UI-UPDATED", () => {
            // Pequeño delay para esperar que el DOM se actualice
            setTimeout(attachHomeListeners, 200);
        });

        // Evento custom que el HomeScreen puede disparar si necesita
        document.addEventListener('home:navigate', navigateHome);

        return { navigateHome };
    },
};

registry.category("services").add("web_home_integration", homeIntegrationService);