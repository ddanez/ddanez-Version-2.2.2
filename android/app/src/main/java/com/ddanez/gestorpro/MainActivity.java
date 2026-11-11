package com.ddanez.gestorpro;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureWebView();
    }

    private void configureWebView() {
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();
            
            // Forzar el zoom de texto al 100% exacto para que el tamaño
            // de la app coincida idénticamente con la versión de Termux/Chrome
            settings.setTextZoom(100);
            
            // Habilitar soporte de viewport estándar idéntico al navegador
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
        }
    }
}

