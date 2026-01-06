/*
    main.js — interactive behavior for Aura landing page
    - Manages product variant & color selection
    - Renders and persists a localStorage-based cart (`aura-cart`)
    - Handles accessible cart panel and mobile nav focus traps

    Keep changes minimal and local — this file is an immediately-invoked
    function expression (IIFE) to avoid leaking globals.
*/
 (function(){
    'use strict';

    const prices = { standard: 149, pro: 199 };
    const cartKey = 'aura-cart';

    /* -----------------------------
       Utilities
    ------------------------------*/
    const $ = sel => document.querySelector(sel);
    const $all = sel => Array.from(document.querySelectorAll(sel));

    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    function formatPrice(n){ return '$' + n; }

    function getFocusableElements(container){
        if(!container) return [];
        return Array.from(container.querySelectorAll(focusableSelector))
            .filter(el=> (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length));
    }

    /* -----------------------------
       Persistence (cart)
    ------------------------------*/
    function loadCart(){
        try{ return JSON.parse(localStorage.getItem(cartKey)) || {items: []}; }
        catch(e){ return {items: []}; }
    }
    function saveCart(cart){ localStorage.setItem(cartKey, JSON.stringify(cart)); }
    function calcTotal(cart){ return cart.items.reduce((s,i)=>s + (i.price * i.qty), 0); }

    /* -----------------------------
       Image Module
       Responsible for mapping swatches to image files and crossfade updates
    ------------------------------*/
    const imageModule = (function(){
        const imageMap = {
            'matte-black': 'images/AuraMatteBlack.png',
            'soft-white': 'images/AuraSoftWhite.png',
            'sand': 'images/AuraSand.png'
        };

        function setProductImage(color){
            const src = imageMap[color];
            const container = $('#productImage');
            if(!container || !src) return;
            container.style.transition = 'opacity 220ms ease';
            container.style.opacity = 0;
            setTimeout(()=>{
                container.style.backgroundImage = `url('${src}')`;
                container.style.opacity = 1;
            }, 220);
        }

        return { setProductImage };
    })();

    /* -----------------------------
       Cart Module
       Renders cart, handles add/remove, and manages the cart panel accessibility
    ------------------------------*/
    const cartModule = (function(){
        const cartButton = $('#cartButton');
        const cartPanel = $('#cartPanel');
        const cartItemsList = $('#cartItems');
        const cartTotalEl = $('#cartTotal');
        const checkoutBtn = $('#checkoutBtn');

        let previousFocus = null;
        let keydownHandler = null;

        function updateCartCount(){
            const cart = loadCart();
            const count = cart.items.reduce((s,i)=>s+i.qty,0);
            const el = $('#cartCount'); if(el) el.textContent = count;
        }

        function renderCart(){
            const cart = loadCart();
            if(!cartItemsList) return;
            cartItemsList.innerHTML = '';
            if(!cart.items.length){
                const li = document.createElement('li');
                li.className = 'cart-item';
                li.innerHTML = '<div class="meta">Your cart is empty.</div>';
                cartItemsList.appendChild(li);
            } else {
                cart.items.forEach(item=>{
                    const li = document.createElement('li');
                    li.className = 'cart-item';
                    li.innerHTML = `
                        <div class="meta">
                            <div class="variant">${item.variant === 'pro' ? 'Aura Pro' : 'Aura Standard'}</div>
                            <div class="color">${item.color.replace('-', ' ')}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div class="qty">${item.qty} × $${item.price}</div>
                            <button class="remove" data-id="${item.id}">Remove</button>
                        </div>
                    `;
                    cartItemsList.appendChild(li);
                });
            }
            if(cartTotalEl) cartTotalEl.textContent = formatPrice(calcTotal(cart));

            // delegate remove via event listener on the list for clarity
            cartItemsList.querySelectorAll('.remove').forEach(btn=>{
                btn.addEventListener('click', ()=> removeFromCart(btn.dataset.id));
            });
        }

        function addToCart(item){
            const cart = loadCart();
            const existing = cart.items.find(i=>i.id===item.id);
            if(existing) existing.qty += item.qty; else cart.items.push(item);
            saveCart(cart);
            updateCartCount();
        }

        function removeFromCart(id){
            const cart = loadCart();
            const idx = cart.items.findIndex(i=>i.id === id);
            if(idx >= 0){ cart.items.splice(idx, 1); saveCart(cart); renderCart(); updateCartCount(); }
        }

        function trapFocus(e){
            if(!cartPanel) return;
            const focusables = getFocusableElements(cartPanel);
            if(!focusables.length){ e.preventDefault(); cartPanel.focus(); return; }
            const first = focusables[0]; const last = focusables[focusables.length - 1];
            if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
            else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
        }

        function openCart(){
            if(!cartPanel) return;
            previousFocus = document.activeElement;
            cartPanel.setAttribute('aria-hidden','false');
            cartPanel.setAttribute('aria-modal','true');
            renderCart();
            setTimeout(()=>{
                const focusables = getFocusableElements(cartPanel);
                if(focusables.length) focusables[0].focus(); else cartPanel.focus();
            }, 0);
            keydownHandler = function(e){ if(e.key === 'Escape') closeCart(); else if(e.key === 'Tab') trapFocus(e); };
            document.addEventListener('keydown', keydownHandler);
        }

        function closeCart(){
            if(!cartPanel) return;
            cartPanel.setAttribute('aria-hidden','true');
            cartPanel.setAttribute('aria-modal','false');
            if(keydownHandler) document.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
            if(previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
            previousFocus = null;
        }

        function attachUI(){
            if(cartButton) cartButton.addEventListener('click', e=>{ e.stopPropagation(); const hidden = cartPanel.getAttribute('aria-hidden') === 'true'; if(hidden) openCart(); else closeCart(); });
            // close when clicking outside
            document.addEventListener('click', (e)=>{ const target = e.target; if(cartPanel && cartButton && !cartPanel.contains(target) && !cartButton.contains(target)) closeCart(); });
            if(checkoutBtn) checkoutBtn.addEventListener('click', ()=> alert('Checkout is simulated — no payments configured.'));
        }

        // expose public API
        return { attachUI, renderCart, addToCart, updateCartCount };
    })();

    /* -----------------------------
       Navigation / Mobile Nav Module
    ------------------------------*/
    const navModule = (function(){
        const menuButton = $('#menuButton');
        const mobileNav = $('#mobileNav');
        let mobileKeydownHandler = null;

        function trapFocusIn(container, e){
            const focusable = getFocusableElements(container);
            if(!focusable.length) return;
            const first = focusable[0]; const last = focusable[focusable.length - 1];
            if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
            else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
        }

        function openMobileNav(){
            if(!mobileNav || !menuButton) return;
            menuButton.setAttribute('aria-expanded','true');
            mobileNav.setAttribute('aria-hidden','false');
            menuButton.classList.add('open');
            document.body.style.overflow = 'hidden';
            setTimeout(()=>{ const first = mobileNav.querySelector('.mobile-link'); if(first) first.focus(); }, 120);
            mobileKeydownHandler = function(e){ if(e.key === 'Escape') closeMobileNav(); else if(e.key === 'Tab') trapFocusIn(mobileNav, e); };
            document.addEventListener('keydown', mobileKeydownHandler);
        }

        function closeMobileNav(){
            if(!mobileNav || !menuButton) return;
            menuButton.setAttribute('aria-expanded','false');
            mobileNav.setAttribute('aria-hidden','true');
            menuButton.classList.remove('open');
            document.body.style.overflow = '';
            if(mobileKeydownHandler) document.removeEventListener('keydown', mobileKeydownHandler);
            mobileKeydownHandler = null;
            menuButton.focus();
        }

        function attachUI(){
            if(menuButton){ menuButton.addEventListener('click', ()=>{ const expanded = menuButton.getAttribute('aria-expanded') === 'true'; if(expanded) closeMobileNav(); else openMobileNav(); }); }
            $all('.mobile-link').forEach(l=> l.addEventListener('click', ()=> closeMobileNav()));
            if(mobileNav){ mobileNav.addEventListener('click', (e)=>{ if(e.target === mobileNav) closeMobileNav(); }); }
        }

        return { attachUI };
    })();

    /* -----------------------------
       Product interactions (variants & swatches)
    ------------------------------*/
    const productModule = (function(){
        let currentVariant = 'standard';
        let currentColor = 'matte-black';
        const addBtn = $('#addToCart');
        const addBtnText = addBtn ? addBtn.textContent : 'Add to cart';

        function init(){
            // initial render
            updatePrice();
            cartModule.updateCartCount();
            imageModule.setProductImage(currentColor);

            // variants
            $all('.variant').forEach(btn=> btn.addEventListener('click', ()=>{ $all('.variant').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); currentVariant = btn.dataset.variant; updatePrice(); }));

            // swatches
            $all('.color-swatch').forEach(s=> s.addEventListener('click', ()=>{ $all('.color-swatch').forEach(x=>x.classList.remove('selected')); s.classList.add('selected'); currentColor = s.dataset.color; imageModule.setProductImage(currentColor); }));

            // add-to-cart
            if(addBtn){ addBtn.addEventListener('click', ()=>{ const price = prices[currentVariant]; const item = { id: currentVariant + '-' + currentColor, variant: currentVariant, color: currentColor, price, qty: 1 }; cartModule.addToCart(item); addBtn.textContent = 'Added ✓'; setTimeout(()=>{ addBtn.textContent = addBtnText; }, 1200); }); }
        }

        function updatePrice(){ const p = prices[currentVariant]; const priceEl = $('#price'); if(priceEl) priceEl.textContent = formatPrice(p); const upgradeNote = $('#upgradeNote'); if(upgradeNote){ if(currentVariant === 'standard'){ upgradeNote.setAttribute('aria-hidden','false'); upgradeNote.style.display = 'block'; } else { upgradeNote.setAttribute('aria-hidden','true'); upgradeNote.style.display = 'none'; } } }

        return { init };
    })();

    /* -----------------------------
       Initialization
    ------------------------------*/
    document.addEventListener('DOMContentLoaded', ()=>{
        // wire modules
        cartModule.attachUI();
        navModule.attachUI();
        productModule.init();
    });
})();
