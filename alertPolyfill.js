import { Platform, Alert } from 'react-native';

if (Platform.OS === 'web') {
  // Inject global CSS for cursor: pointer on web buttons
  if (typeof document !== 'undefined' && document.head) {
    const styleId = 'rn-web-cursor-pointer-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        [role="button"], button, a, [tabindex] {
          cursor: pointer !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Override Alert.alert for Web
  Alert.alert = (title, message, buttons, options) => {
    const btnList = Array.isArray(buttons) && buttons.length > 0
      ? buttons
      : [{ text: 'ตกลง' }];

    if (typeof document !== 'undefined' && document.body) {
      // Remove any existing backdrop
      const existing = document.getElementById('rn-web-alert-backdrop');
      if (existing) {
        existing.remove();
      }

      // Backdrop
      const backdrop = document.createElement('div');
      backdrop.id = 'rn-web-alert-backdrop';
      backdrop.style.position = 'fixed';
      backdrop.style.top = '0';
      backdrop.style.left = '0';
      backdrop.style.right = '0';
      backdrop.style.bottom = '0';
      backdrop.style.backgroundColor = 'rgba(15, 23, 42, 0.65)';
      backdrop.style.backdropFilter = 'blur(4px)';
      backdrop.style.display = 'flex';
      backdrop.style.alignItems = 'center';
      backdrop.style.justifyContent = 'center';
      backdrop.style.zIndex = '999999';
      backdrop.style.padding = '16px';
      backdrop.style.boxSizing = 'border-box';

      // Card
      const card = document.createElement('div');
      card.style.backgroundColor = '#FFFFFF';
      card.style.borderRadius = '16px';
      card.style.padding = '24px';
      card.style.maxWidth = '420px';
      card.style.width = '100%';
      card.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
      card.style.boxSizing = 'border-box';
      card.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
      card.style.textAlign = 'center';

      const isWarningOrError = !title || title.includes('แจ้งเตือน') || title.includes('ข้อผิดพลาด') || title.includes('เกิดข้อผิดพลาด');
      const isSuccess = title && title.includes('สำเร็จ');

      // Top Red Accent Line
      const topBar = document.createElement('div');
      topBar.style.height = '4px';
      topBar.style.backgroundColor = isSuccess ? '#2E7D32' : (isWarningOrError ? '#D9381E' : '#006664');
      topBar.style.margin = '-24px -24px 20px -24px';
      topBar.style.borderRadius = '16px 16px 0 0';
      card.appendChild(topBar);

      // Icon badge
      const iconWrap = document.createElement('div');
      iconWrap.style.width = '52px';
      iconWrap.style.height = '52px';
      iconWrap.style.borderRadius = '26px';
      iconWrap.style.margin = '0 auto 14px auto';
      iconWrap.style.display = 'flex';
      iconWrap.style.alignItems = 'center';
      iconWrap.style.justifyContent = 'center';
      iconWrap.style.fontSize = '26px';
      if (isSuccess) {
        iconWrap.style.backgroundColor = '#E8F5E9';
        iconWrap.style.color = '#2E7D32';
        iconWrap.textContent = '✓';
      } else if (isWarningOrError) {
        iconWrap.style.backgroundColor = '#FFEBEE';
        iconWrap.style.color = '#D9381E';
        iconWrap.textContent = '!';
        iconWrap.style.fontWeight = 'bold';
      } else {
        iconWrap.style.backgroundColor = '#E0F2F1';
        iconWrap.style.color = '#006664';
        iconWrap.textContent = 'ℹ';
      }
      card.appendChild(iconWrap);

      // Title
      if (title) {
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.margin = '0 0 10px 0';
        titleEl.style.fontSize = '18px';
        titleEl.style.fontWeight = '700';
        titleEl.style.color = isSuccess ? '#2E7D32' : (isWarningOrError ? '#D9381E' : '#1E293B');
        card.appendChild(titleEl);
      }

      // Message
      if (message) {
        const msgEl = document.createElement('p');
        msgEl.textContent = message;
        msgEl.style.margin = '0 0 20px 0';
        msgEl.style.fontSize = '14px';
        msgEl.style.color = '#475569';
        msgEl.style.whiteSpace = 'pre-wrap';
        msgEl.style.lineHeight = '1.5';
        card.appendChild(msgEl);
      }

      // Buttons container
      const btnContainer = document.createElement('div');
      btnContainer.style.display = 'flex';
      btnContainer.style.flexDirection = btnList.length > 2 ? 'column' : 'row';
      btnContainer.style.gap = '10px';
      btnContainer.style.justifyContent = 'center';

      const closeAlert = () => {
        if (backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
      };

      btnList.forEach((btn) => {
        const button = document.createElement('button');
        button.textContent = btn.text || 'ตกลง';
        button.style.padding = '10px 16px';
        button.style.borderRadius = '10px';
        button.style.fontSize = '14px';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.style.transition = 'all 0.15s ease';
        button.style.flex = '1';
        button.style.boxSizing = 'border-box';

        if (btn.style === 'destructive' || isWarningOrError) {
          button.style.backgroundColor = '#D9381E';
          button.style.color = '#FFFFFF';
          button.style.border = 'none';
        } else if (btn.style === 'cancel') {
          button.style.backgroundColor = '#F1F5F9';
          button.style.color = '#475569';
          button.style.border = '1px solid #CBD5E1';
        } else if (isSuccess) {
          button.style.backgroundColor = '#2E7D32';
          button.style.color = '#FFFFFF';
          button.style.border = 'none';
        } else {
          button.style.backgroundColor = '#006664';
          button.style.color = '#FFFFFF';
          button.style.border = 'none';
        }

        button.onmouseover = () => {
          button.style.opacity = '0.9';
        };
        button.onmouseout = () => {
          button.style.opacity = '1';
        };

        button.onclick = () => {
          closeAlert();
          if (typeof btn.onPress === 'function') {
            btn.onPress();
          }
        };

        btnContainer.appendChild(button);
      });

      card.appendChild(btnContainer);
      backdrop.appendChild(card);

      // Close on backdrop click if cancelable
      if (options && options.cancelable) {
        backdrop.onclick = (e) => {
          if (e.target === backdrop) {
            closeAlert();
            if (typeof options.onDismiss === 'function') {
              options.onDismiss();
            }
          }
        };
      }

      document.body.appendChild(backdrop);
    } else {
      // Fallback window.confirm / window.alert
      const formattedMessage = [title, message].filter(Boolean).join('\n\n');
      if (btnList.length > 1) {
        const confirmed = window.confirm(formattedMessage);
        if (confirmed) {
          const actionBtn = btnList.find(b => b.style !== 'cancel') || btnList[1] || btnList[0];
          if (actionBtn && typeof actionBtn.onPress === 'function') {
            actionBtn.onPress();
          }
        } else {
          const cancelBtn = btnList.find(b => b.style === 'cancel') || btnList[0];
          if (cancelBtn && typeof cancelBtn.onPress === 'function') {
            cancelBtn.onPress();
          }
        }
      } else {
        window.alert(formattedMessage);
        if (btnList[0] && typeof btnList[0].onPress === 'function') {
          btnList[0].onPress();
        }
      }
    }
  };
}
