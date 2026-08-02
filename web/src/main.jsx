import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { GrowlProvider } from './context/GrowlContext.jsx';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ThemeProvider>
      <GrowlProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </GrowlProvider>
    </ThemeProvider>
  </BrowserRouter>,
);
