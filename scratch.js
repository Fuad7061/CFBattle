  showReviveProgress(country, flagUrl, current, target) {
    let container = this.$('revive-trackers');
    if (!container) {
      container = document.createElement('div');
      container.id = 'revive-trackers';
      container.style.position = 'absolute';
      container.style.top = '120px';
      container.style.right = '10px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.zIndex = '100';
      const hud = this.$('hud');
      if (hud) hud.appendChild(container);
    }
    
    let el = this.$(`revive-${country.code}`);
    if (!el) {
      el = document.createElement('div');
      el.id = `revive-${country.code}`;
      el.className = 'revive-progress-item';
      el.style.background = 'rgba(10, 25, 40, 0.85)';
      el.style.border = '1px solid rgba(245, 158, 11, 0.6)';
      el.style.padding = '4px 8px';
      el.style.borderRadius = '8px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '8px';
      el.style.color = '#f59e0b';
      el.style.fontWeight = 'bold';
      el.style.fontSize = '12px';
      el.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.3)';
      el.innerHTML = `
        <img src="${flagUrl}" style="width: 24px; height: 16px; border-radius: 2px;" alt="">
        <span class="revive-text">${current}/${target} REVIVE</span>
      `;
      container.appendChild(el);
    } else {
      el.querySelector('.revive-text').textContent = `${current}/${target} REVIVE`;
      // pop animation
      el.style.transform = 'scale(1.1)';
      setTimeout(() => el.style.transform = 'scale(1)', 200);
    }
  }

  hideReviveProgress(code) {
    const el = this.$(`revive-${code}`);
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.8)';
      setTimeout(() => el.remove(), 300);
    }
  }
