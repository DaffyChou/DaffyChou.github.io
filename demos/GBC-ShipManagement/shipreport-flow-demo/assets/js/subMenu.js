document.addEventListener('DOMContentLoaded', function () {
    const submenuToggles = document.querySelectorAll('.dropdown-submenu > .dropdown-toggle');
  
    submenuToggles.forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
  
        // 點擊新項目前，先關掉所有開啟的 submenu
        submenuToggles.forEach(function (other) {
          if (other !== el) {
            other.classList.remove('show');
            const otherMenu = other.nextElementSibling;
            if (otherMenu) {
              otherMenu.classList.remove('show');
              otherMenu.style.position = '';
              otherMenu.style.top = '';
              otherMenu.style.left = '';
            }
          }
        });
  
        // 切換目前 submenu 狀態
        el.classList.toggle('show');
        const nextMenu = el.nextElementSibling;
        if (nextMenu) {
          nextMenu.classList.toggle('show');
  
          // 桌機才定位
          if (window.innerWidth >= 992) {
            const targetRect = e.target.getBoundingClientRect();
            nextMenu.style.position = 'absolute';
            nextMenu.style.top = `${targetRect.top - 46}px`; // nav 高度
          } else {
            // 手機／平板恢復預設
            nextMenu.style.position = '';
            nextMenu.style.top = '';
            nextMenu.style.left = '';
          }
        }
      });
    });
  
    // 若點擊在 dropdown 區域外，也要關閉所有 submenu
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.dropdown-submenu')) {
        submenuToggles.forEach(function (el) {
          el.classList.remove('show');
          const nextMenu = el.nextElementSibling;
          if (nextMenu) {
            nextMenu.classList.remove('show');
            nextMenu.style.position = '';
            nextMenu.style.top = '';
            nextMenu.style.left = '';
          }
        });
      }
    });
  });
  