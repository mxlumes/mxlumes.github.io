const RENDER_URL = 'https://mxlumes-api.onrender.com';
const MERCHANT_UPI_ID = "7668077298@ybl"; 

let cart = []; 
let currentAuthMode = 'login'; 
let checkoutTotal = 0; 
let userLocation = "Unknown";

let isVerifying = false; 
window.paymentIntentFired = null; 
let pendingCheckout = false; 

// INVENTORY DATA
let liveProducts = [];

const escapeHTML = (str) => {
    if (str == null) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
};

const vibrate = (ms) => { 
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} 
};

window.onload = () => {
    renderReviews(); 
    setupReviewStars(); 
    checkAuthStatus(); 
    runCalc(); 
    fetchLiveInventory();

    fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(data => { userLocation = data.city + ", " + data.region; })
        .catch(e => {});

    setTimeout(() => {
        const greeting = document.getElementById('vGreeting'); 
        const panel = document.getElementById('vijetaPanel');
        if(greeting && !panel.classList.contains('active')) {
            greeting.classList.add('show');
            setTimeout(() => { greeting?.classList.remove('show'); }, 6000); 
        }
    }, 2000);

    // Listener for VIP Discount input to auto-calculate the total
    const vipDiscountInput = document.getElementById('vip-discount-amt');
    if (vipDiscountInput) {
        vipDiscountInput.addEventListener('input', renderVIPCart);
    }
};

window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        isVerifying = false; 
        const btn = document.getElementById('pay-confirm-btn');
        if(btn) {
            btn.disabled = false;
            btn.innerText = "✓ I Have Completed The Payment";
            btn.classList.remove('pulse-btn-accent', 'pulse-btn-green');
            btn.style.background = "var(--accent)";
            btn.style.color = "#fff";
        }
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && window.paymentIntentFired) {
        const timeAway = Date.now() - window.paymentIntentFired;
        window.paymentIntentFired = null; 
        
        if (timeAway > 4000 && !isVerifying && cart.length > 0) {
            const btn = document.getElementById('pay-confirm-btn');
            if(btn && !btn.disabled) {
                btn.innerText = "Tap to Verify Payment ➝";
                btn.classList.add('pulse-btn-accent'); 
                showToast("Welcome back! Please verify your order.");
            }
        }
    }
});

// 📦 FETCH & RENDER INVENTORY
async function fetchLiveInventory() {
    try {
        const res = await fetch(`${RENDER_URL}/api/products`);
        if(!res.ok) throw new Error();
        liveProducts = await res.json();
        renderStorefront();
    } catch(e) {
        console.error("Using fallback inventory");
    }
}

function renderStorefront() {
    const grid = document.getElementById('product-grid');
    if(!grid) return;
    
    if(liveProducts.length === 0) {
        grid.innerHTML = `<div style="color:var(--text-dim); text-align:center; width:100%; grid-column:1/-1;">Inventory currently updating...</div>`;
        return;
    }

    let html = '';
    liveProducts.forEach(p => {
        if(!p.inStock) return; 
        
        let tagStyle = '';
        if(p.tag === 'Best Seller') tagStyle = 'background:#fff; color:#000; border-color:#fff;';
        else if(p.tag === 'Monthly Pack') tagStyle = 'color:var(--accent); border-color:var(--accent);';

        let cornerBadge = '';
        if(p.tag === 'Monthly Pack') {
            cornerBadge = `<div style="position:absolute; top:20px; right:-30px; background:var(--accent); padding:5px 30px; transform:rotate(45deg); font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1px; z-index:2;">Super Saver</div>`;
        }

        let borderStyle = p.tag === 'Best Seller' ? 'border-color:rgba(255,255,255,0.4) !important;' : '';

        html += `
        <div class="product-card reveal active" style="position:relative; overflow:hidden; ${borderStyle}">
            ${cornerBadge}
            <div>
                <span class="p-tag" style="${tagStyle}">${escapeHTML(p.tag)}</span>
                <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" class="p-img" loading="lazy" decoding="async">
                <h3>${escapeHTML(p.name)}</h3>
                <p style="color:var(--text-dim); font-size:14px; margin-top:5px;">${escapeHTML(p.description)}</p>
            </div>
            <div style="margin-top:20px;">
                <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:15px;">
                    <div style="font-size:24px; font-weight:700;">₹${p.currentPrice.toLocaleString()}</div>
                    <div style="font-size:16px; text-decoration:line-through; color:var(--text-dim);">₹${p.originalPrice.toLocaleString()}</div>
                </div>
                <button class="btn btn-primary" style="width:100%;" onclick="addToCart('${escapeHTML(p.name)}', ${p.currentPrice})">Add to Cart</button>
            </div>
        </div>`;
    });
    grid.innerHTML = html;
}

function blurInputs() { 
    document.activeElement?.blur(); 
}

function lockScroll() {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
}

function unlockScroll() {
    document.body.style.overflow = '';
    document.documentElement.style.overscrollBehavior = '';
    document.body.style.overscrollBehavior = '';
}

function checkAuthStatus() {
    try {
        const user = JSON.parse(localStorage.getItem('mxlumes_user'));
        const token = localStorage.getItem('mxlumes_token');
        const authLink = document.getElementById('nav-auth-link');
        
        if (user && token && user.email) {
            authLink.innerHTML = `Hi, ${escapeHTML(user.name).split(' ')[0]} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            authLink.onclick = (e) => { e.preventDefault(); openProfileModal(); vibrate(50); }; 
            syncCartWithCloud(); 
        } else {
            localStorage.removeItem('mxlumes_user');
            localStorage.removeItem('mxlumes_token');
            authLink.innerHTML = `Sign In <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            authLink.onclick = (e) => { e.preventDefault(); openAuthModal(); vibrate(50); };
        }
    } catch(e) {
        localStorage.removeItem('mxlumes_user');
        localStorage.removeItem('mxlumes_token');
    }
}

async function openProfileModal() {
    document.getElementById('profile-modal-overlay').classList.add('active');
    lockScroll(); 
    const user = JSON.parse(localStorage.getItem('mxlumes_user'));
    if(!user) return;
    
    document.getElementById('prof-name').innerText = escapeHTML(user.name);
    document.getElementById('prof-email').innerText = escapeHTML(user.email);
    
    const tbody = document.getElementById('prof-orders-tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">Loading orders...</td></tr>';

    const isolatedUserStr = encodeURIComponent(JSON.stringify({
        name: user.name, email: user.email, phone: user.phone, address: user.address
    })).replace(/'/g, "%27");

    try {
        const res = await fetch(`${RENDER_URL}/api/user/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('mxlumes_token')}`
            },
            body: JSON.stringify({ email: user.email })
        });
        
        if (res.status === 429) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Too many requests. Please wait a moment.</td></tr>';
            return;
        }

        const orders = await res.json();
        let tbodyHtml = '';
        
        if(orders.length === 0) {
            tbodyHtml = '<tr><td colspan="4" style="text-align:center; color:#555;">No orders found.</td></tr>';
        } else {
            orders.forEach(o => {
                const safeItems = o.items.map(i => ({ name: escapeHTML(i.name), qty: i.qty, price: i.price }));
                const itemsJson = JSON.stringify(safeItems).replace(/"/g, '&quot;');
                
                const txEnc = encodeURIComponent(o.transactionDetails || '').replace(/'/g, "%27");
                
                let actionBtn = '';
                if (o.status === 'Pending Verification') {
                    actionBtn = `
                        <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); padding: 10px; border-radius: 12px; max-width: 200px;">
                            <div style="display:flex; align-items:center; gap:5px; color:var(--warning); font-size:12px; font-weight:800; margin-bottom:5px;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                Payment Under Review
                            </div>
                            <div style="font-size:10px; color:#888; line-height:1.4; margin-bottom:8px;">
                                Our accounts team is manually matching your UPI transfer to this order. This usually takes 1-2 hours.
                            </div>
                            <a href="https://wa.me/917668077298?text=Hi,%20I%20want%20to%20confirm%20my%20payment%20for%20Order%20${encodeURIComponent(o.orderId)}" target="_blank" style="display:inline-block; background:var(--whatsapp); color:#000; padding:6px 10px; border-radius:6px; font-size:10px; font-weight:800; text-decoration:none;">Message Support</a>
                        </div>
                    `;
                } else {
                    actionBtn = `<button class="btn btn-outline" style="padding: 6px 12px; font-size:10px; background:#fff; color:#000;" onclick="printInvoice('${escapeHTML(o.orderId)}', '${escapeHTML(o.createdAt)}', ${o.totalAmount}, '${itemsJson}', '${txEnc}', '${isolatedUserStr}'); vibrate(50);">Download Invoice</button>`;
                }

                tbodyHtml += `
                    <tr>
                        <td style="font-weight:700; color:#fff;">${escapeHTML(o.orderId)}</td>
                        <td>${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}</td>
                        <td style="color:var(--success); font-weight:700;">₹${(o.totalAmount || 0).toLocaleString()}</td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            });
        }
        tbody.innerHTML = tbodyHtml;
    } catch(e) { 
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Failed to connect to server.</td></tr>';
    }
}

function closeProfileModal() { 
    blurInputs();
    document.getElementById('profile-modal-overlay').classList.remove('active'); 
    unlockScroll(); 
}

function printInvoice(orderId, dateStr, amount, itemsJson, txEncoded = '', userEncoded = '') {
    const items = JSON.parse(itemsJson.replace(/&quot;/g, '"'));
    
    let invoiceUser = { name: 'Valued Customer', email: 'N/A', phone: 'N/A', address: 'N/A' };
    try {
        if(userEncoded) invoiceUser = JSON.parse(decodeURIComponent(userEncoded));
    } catch(e) { console.error("Invoice user parse error"); }

    const waLink = `https://wa.me/917668077298?text=Hi,%20I%20need%20help%20with%20Order%20${encodeURIComponent(orderId)}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(waLink)}`;

    const safeName = escapeHTML(invoiceUser.name);
    const safeEmail = escapeHTML(invoiceUser.email);
    const safePhone = invoiceUser.phone ? escapeHTML(invoiceUser.phone) : 'No Phone Provided';
    const safeAddress = invoiceUser.address ? escapeHTML(invoiceUser.address).replace(/\n/g, '<br>') : 'Address not provided.';
    
    const decodedTx = decodeURIComponent(txEncoded);
    const transactionDetails = escapeHTML(decodedTx).replace(/\n/g, '<br>');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>M-X Lumes | Invoice ${orderId}</title>
            <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
            <style>
                :root { --black: #050505; --gray: #888888; --light-gray: #f4f4f5; --border: #e5e7eb; }
                body { font-family: 'Manrope', sans-serif; color: var(--black); margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .invoice-box { max-width: 800px; margin: auto; padding: 30px; background: transparent; position: relative; box-sizing: border-box; }
                .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-family: 'Space Grotesk', sans-serif; font-size: 140px; font-weight: 800; color: rgba(0, 0, 0, 0.03); white-space: nowrap; z-index: -1; pointer-events: none; user-select: none; }
                .content { position: relative; z-index: 1; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--black); padding-bottom: 20px; margin-bottom: 25px; }
                .brand-name { font-family: 'Space Grotesk', sans-serif; font-size: 36px; font-weight: 700; letter-spacing: -1px; margin: 0; }
                .brand-tagline { font-size: 12px; color: var(--gray); text-transform: uppercase; letter-spacing: 2px; margin-top: 5px; }
                .invoice-title { font-family: 'Space Grotesk', sans-serif; font-size: 32px; font-weight: 500; text-transform: uppercase; margin: 0; line-height: 1; color: #e5e5e5; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 25px; }
                .info-block h4 { font-size: 10px; color: var(--gray); text-transform: uppercase; letter-spacing: 1px; margin: 0 0 5px 0; }
                .info-block p { margin: 0; font-size: 12px; line-height: 1.4; font-weight: 600; }
                .info-block p span { font-weight: 400; color: #555; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
                th { text-align: left; padding: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--gray); border-bottom: 1px solid var(--border); }
                td { padding: 12px 10px; font-size: 13px; font-weight: 600; border-bottom: 1px solid var(--light-gray); }
                .totals-container { display: flex; justify-content: flex-end; margin-bottom: 20px; }
                .totals-box { width: 280px; background: var(--light-gray); padding: 20px; border-radius: 12px; }
                .total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; font-weight: 600; }
                .total-final { display: flex; justify-content: space-between; font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 700; border-top: 1px solid #ccc; padding-top: 12px; margin-top: 5px; }
                .footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 20px; margin-top: 20px;}
                .footer-notes h4 { font-family: 'Space Grotesk', sans-serif; font-size: 14px; margin: 0 0 5px 0; }
                .footer-notes p { font-size: 11px; color: var(--gray); margin: 0; line-height: 1.4; }
                .qr-box { text-align: center; }
                .qr-box img { width: 60px; height: 60px; border-radius: 8px; border: 1px solid var(--border); padding: 4px; }
                .qr-box span { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: 1px; color: var(--gray); margin-top: 5px; }
                .btn-print { background: var(--black); color: #fff; padding: 12px 25px; text-align: center; border-radius: 30px; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; margin-bottom: 20px; display: inline-block; }
                
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { background: #fff; }
                    .invoice-box { padding: 0; width: 100%; max-width: 100%; box-shadow: none; height: auto; page-break-inside: avoid; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div style="text-align:center; padding-top: 15px;" class="no-print">
                <div class="btn-print" onclick="window.print()">🖨️ Tap Here to Save as PDF</div>
            </div>
            
            <div class="watermark">M-X LUMES</div>
            
            <div class="invoice-box">
                <div class="content">
                    <div class="header">
                        <div>
                            <h1 class="brand-name">M-X LUMES</h1>
                            <div class="brand-tagline">Premium Resin Systems</div>
                        </div>
                        <h2 class="invoice-title">Tax Invoice</h2>
                    </div>

                    <div class="info-grid">
                        <div class="info-block">
                            <h4>Billed To</h4>
                            <p>${safeName}</p>
                            <p><span>${safeEmail}</span></p>
                            <p><span>${safePhone}</span></p>
                        </div>
                        <div class="info-block">
                            <h4>Shipped To</h4>
                            <p style="font-weight: 400; color: #555;">${safeAddress}</p>
                        </div>
                        <div class="info-block">
                            <h4>Order Details</h4>
                            <p>Order ID: <span style="color: var(--black); font-weight: 800;">${orderId}</span></p>
                            <p>Date: <span>${dateStr !== 'N/A' ? new Date(dateStr).toLocaleDateString() : 'N/A'}</span></p>
                            <p>Time: <span>${dateStr !== 'N/A' ? new Date(dateStr).toLocaleTimeString() : 'N/A'}</span></p>
                            <p>Status: <span style="color: #10b981; font-weight: 800;">PAID & VERIFIED</span></p>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Item Description</th>
                                <th style="text-align: center;">Qty</th>
                                <th style="text-align: right;">Unit Price</th>
                                <th style="text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(i => {
                                const isDiscount = i.price < 0;
                                return `
                                <tr>
                                    <td>${escapeHTML(i.name)}</td>
                                    <td style="text-align: center;">${i.qty}</td>
                                    <td style="text-align: right; color: var(--gray);">${isDiscount ? '' : '₹' + i.price.toLocaleString()}</td>
                                    <td style="text-align: right; ${isDiscount ? 'color: #10b981;' : ''}">₹${(i.price * i.qty).toLocaleString()}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>

                    <div class="totals-container">
                        <div class="totals-box">
                            <div class="total-row">
                                <span>Subtotal</span>
                                <span>₹${amount.toLocaleString()}</span>
                            </div>
                            <div class="total-row" style="color: #10b981;">
                                <span>Shipping</span>
                                <span>Free</span>
                            </div>
                            <div class="total-final">
                                <span>Total Paid</span>
                                <span>₹${amount.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div style="padding: 15px; background: var(--light-gray); border-radius: 10px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 5px 0; font-size: 10px; text-transform: uppercase; color: var(--gray); letter-spacing: 1px;">Payment & Transaction Details</h4>
                        <p style="margin: 0; font-size: 12px; font-weight: 600; color: var(--black); line-height: 1.4; word-break: break-all;">
                            ${transactionDetails || 'Payment Pending / No manual details provided.'}
                        </p>
                    </div>

                    <div class="company-details" style="margin-top: 20px; padding-top: 15px; border-top: 2px solid var(--black); text-align: center;">
                        <h4 style="font-family: 'Space Grotesk', sans-serif; margin: 0 0 5px 0; font-size: 16px;">M-X LUMES</h4>
                        <p style="margin: 0; color: #555; font-size: 11px; line-height: 1.4; font-weight: 600;">
                            Achronda Kashi Road, Partapur, Meerut, 250103<br>
                            Website: mxlumes.com | Support: +91-7668077298
                        </p>
                    </div>

                    <div class="footer">
                        <div class="footer-notes">
                            <h4>Thank you for your trust.</h4>
                            <p>If you have any questions about mixing ratios, curing times, or your shipment,<br>scan the QR code to connect directly with our expert team on WhatsApp.</p>
                        </div>
                        <div class="qr-box">
                            <img src="${qrSrc}" alt="WhatsApp QR" onload="window.print()" onerror="window.print()">
                            <span>Support</span>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function logout(e) {
    e.stopPropagation();
    localStorage.removeItem('mxlumes_token');
    localStorage.removeItem('mxlumes_user');
    cart = []; 
    renderCart();
    closeProfileModal();
    showToast("Logged out successfully");
    checkAuthStatus();
}

function openAuthModal() { 
    document.getElementById('auth-modal-overlay').classList.add('active'); 
    lockScroll(); 
    switchAuthTab('login'); 
}

function openGuestCheckoutModal() {
    document.getElementById('auth-modal-overlay').classList.add('active'); 
    lockScroll(); 
    currentAuthMode = 'guest';

    document.getElementById('auth-error').style.display = 'none';
    
    document.getElementById('auth-modal-title').innerText = "Delivery Details";
    document.getElementById('auth-modal-subtitle').innerText = "Where should we send your order?";
    document.getElementById('auth-tabs').style.display = 'none';

    document.getElementById('auth-name').style.display = 'block'; document.getElementById('auth-name').required = true;
    document.getElementById('auth-phone').style.display = 'block'; document.getElementById('auth-phone').required = true;
    document.getElementById('auth-address').style.display = 'block'; document.getElementById('auth-address').required = true;
    document.getElementById('auth-email').style.display = 'block'; document.getElementById('auth-email').required = true;
    
    document.getElementById('auth-btn').innerHTML = "Continue to Payment &nbsp; 🔒";
}

function closeAuthModal() { 
    blurInputs();
    document.getElementById('auth-modal-overlay').classList.remove('active'); 
    unlockScroll();
}

function switchAuthTab(mode) {
    currentAuthMode = mode;
    document.getElementById('auth-error').style.display = 'none';
    
    document.getElementById('auth-modal-title').innerText = "M-X LUMES";
    document.getElementById('auth-modal-subtitle').innerText = "The Professional Standard.";
    document.getElementById('auth-tabs').style.display = 'flex';

    const nameInp = document.getElementById('auth-name');
    const emailInp = document.getElementById('auth-email');
    const phoneInp = document.getElementById('auth-phone');
    const addrInp = document.getElementById('auth-address');
    const btn = document.getElementById('auth-btn');
    
    if (mode === 'signup') {
        nameInp.style.display = 'block'; nameInp.required = true;
        emailInp.style.display = 'block'; emailInp.required = true;
        phoneInp.style.display = 'block'; phoneInp.required = true;
        addrInp.style.display = 'block'; addrInp.required = true;
        btn.innerText = "Create Account";
        document.getElementById('tab-signup').style.color = "#fff";
        document.getElementById('tab-login').style.color = "#555";
    } else {
        nameInp.style.display = 'none'; nameInp.required = false;
        emailInp.style.display = 'none'; emailInp.required = false;
        addrInp.style.display = 'none'; addrInp.required = false;
        phoneInp.style.display = 'block'; phoneInp.required = true;
        btn.innerText = "Secure Login";
        document.getElementById('tab-login').style.color = "#fff";
        document.getElementById('tab-signup').style.color = "#555";
    }
}

async function submitAuth(e) {
    e.preventDefault();
    blurInputs();
    const btn = document.getElementById('auth-btn');
    const errorDiv = document.getElementById('auth-error');
    
    btn.disabled = true;
    const originalBtnText = btn.innerHTML;
    btn.innerText = "Processing..."; 
    errorDiv.style.display = 'none';

    const rawPhone = document.getElementById('auth-phone').value.trim();
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);

    if (cleanPhone.length !== 10) {
        errorDiv.innerText = "Please enter a valid 10-digit mobile number.";
        errorDiv.style.display = 'block';
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
        return;
    }

    if (currentAuthMode === 'login') {
        try {
            const response = await fetch(`${RENDER_URL}/api/login/phone`, { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ phone: cleanPhone }) 
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Account not found. Please sign up.");
            
            try {
                localStorage.setItem('mxlumes_token', data.token);
                localStorage.setItem('mxlumes_user', JSON.stringify(data.user));
            } catch(err) {}

            showToast("Login Successful!");
            closeAuthModal();
            document.getElementById('auth-form').reset();
            checkAuthStatus();
        } catch (error) {
            errorDiv.innerText = error.message; 
            errorDiv.style.display = 'block'; 
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
        }
        return;
    }

    const name = document.getElementById('auth-name').value.trim();
    const email = document.getElementById('auth-email').value.trim();
    const address = document.getElementById('auth-address').value.trim();
    const password = cleanPhone; 

    if (!name || !email || !address) {
        errorDiv.innerText = "Please complete all fields.";
        errorDiv.style.display = 'block';
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
        return;
    }

    try {
        const response = await fetch(`${RENDER_URL}/api/signup`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, email, phone: cleanPhone, address, password }) 
        });
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('mxlumes_token', data.token);
            localStorage.setItem('mxlumes_user', JSON.stringify(data.user));
            closeAuthModal();
            checkAuthStatus();
            if(currentAuthMode === 'guest' || pendingCheckout) initiateCheckout(); 
            return;
        } else if (response.status === 400 || response.status === 409) {
            
            const loginRes = await fetch(`${RENDER_URL}/api/login/phone`, { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ phone: cleanPhone }) 
            });
            
            if (loginRes.ok) {
                const loginData = await loginRes.json();
                localStorage.setItem('mxlumes_token', loginData.token);
                localStorage.setItem('mxlumes_user', JSON.stringify(loginData.user));
                closeAuthModal();
                checkAuthStatus();
                if(currentAuthMode === 'guest' || pendingCheckout) initiateCheckout(); 
                return;
            } else {
                throw new Error("Email exists, but phone number doesn't match our records. Please try logging in.");
            }
        } else {
            throw new Error("Failed to process delivery details. Please try again.");
        }
    } catch(err) {
        errorDiv.innerText = err.message; 
        errorDiv.style.display = 'block'; 
        if(err.message.includes("logging in")) {
            setTimeout(() => { switchAuthTab('login'); document.getElementById('auth-phone').value = cleanPhone; }, 2000);
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

function updateReminder() {
    const reminder = document.getElementById('cartReminder');
    const sidebar = document.getElementById('cartSidebar');
    if (cart.length > 0 && !sidebar.classList.contains('active')) { reminder.classList.add('show'); } 
    else { reminder.classList.remove('show'); }
}

async function syncCartWithCloud(cartData = null) {
    const user = JSON.parse(localStorage.getItem('mxlumes_user'));
    if (!user) return;
    try {
        const response = await fetch(`${RENDER_URL}/api/user/sync-cart`, { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('mxlumes_token')}`
            }, 
            body: JSON.stringify({ email: user.email, cartData }) 
        });
        if (response.status === 429) return; 
        const data = await response.json();
        if (!cartData && data.cart && data.cart.length > 0) { cart = data.cart; renderCart(); }
    } catch (e) {}
}

function addToCart(name, price) {
    vibrate(50);
    let totalUniqueItems = cart.length;
    let existingItem = cart.find(i => i.name === name);
    
    if (!existingItem && totalUniqueItems >= 100) {
        showToast("Cart limit reached.", true);
        return;
    }

    if (existingItem) { existingItem.qty++; } else { cart.push({name, price, qty: 1}); }
    
    renderCart(); 
    showToast("Added to Cart"); 
    syncCartWithCloud(cart); 
    
    const fab = document.querySelector('.cart-fab');
    fab.style.transform = 'translate3d(0, -10px, 0) scale(1.1)';
    setTimeout(() => fab.style.transform = 'translate3d(0, 0, 0) scale(1)', 200);
}

function updateQty(name, change) {
    vibrate(30);
    let item = cart.find(i => i.name === name);
    if(item) { item.qty += change; if(item.qty <= 0) cart = cart.filter(i => i.name !== name); }
    renderCart(); syncCartWithCloud(cart);
}

function renderCart() {
    const container = document.getElementById('cartItems'); 
    let total = 0; let count = 0; let htmlBuffer = '';
    
    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-cart" style="color:#888; margin-top:20px; text-align:center;">Your cart is empty.<br>Start adding some magic. ✨</div>';
        document.getElementById('cartTotal').innerText = '₹0';
        document.getElementById('cartCount').innerText = '0';
        checkoutTotal = 0; updateReminder(); return;
    }
    
    cart.forEach(item => { 
        total += item.price * item.qty; count += item.qty;
        htmlBuffer += `
        <div class="cart-item">
            <div class="c-info"><h4 style="margin-bottom:4px; color:#fff;">${escapeHTML(item.name)}</h4><p style="font-size:12px; color:#888; margin:0;">High-Gloss System</p></div>
            <div class="c-actions" style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
                <div class="c-price" style="color:#fff; font-weight:700;">₹${(item.price * item.qty).toLocaleString()}</div>
                <div class="qty-control" style="display:flex; align-items:center; background:#000; border:1px solid #333; border-radius:20px; overflow:hidden;">
                    <div class="qty-btn" style="width:30px; height:30px; display:flex; justify-content:center; align-items:center; color:#fff; cursor:pointer;" onclick="updateQty('${escapeHTML(item.name)}', -1)">-</div>
                    <div class="qty-val" style="width:20px; text-align:center; color:#fff; font-size:12px; font-weight:800;">${item.qty}</div>
                    <div class="qty-btn" style="width:30px; height:30px; display:flex; justify-content:center; align-items:center; color:#fff; cursor:pointer;" onclick="updateQty('${escapeHTML(item.name)}', 1)">+</div>
                </div>
            </div>
        </div>`; 
    });
    
    container.innerHTML = htmlBuffer;
    checkoutTotal = total;
    document.getElementById('cartTotal').innerText = `₹${total.toLocaleString()}`; 
    document.getElementById('cartCount').innerText = count;
    updateReminder();
}

function toggleCart() { 
    const sidebar = document.getElementById('cartSidebar');
    sidebar.classList.toggle('active'); 
    if(sidebar.classList.contains('active')) lockScroll(); else unlockScroll();
    updateReminder(); 
}

function showToast(msg, isError = false) { 
    const t = document.getElementById('toast'); 
    t.innerText = msg; 
    if(isError) t.classList.add('error'); else t.classList.remove('error');
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), 3000); 
}

function trackPaymentIntent() {
    window.paymentIntentFired = Date.now();
}

function copyUPI() {
    navigator.clipboard.writeText("7668077298@ybl");
    showToast("UPI ID Copied! Paste it in your app.");
    vibrate(50);
}

function initiateCheckout() {
    if (cart.length === 0) return showToast("Your cart is empty", true);
    
    const user = JSON.parse(localStorage.getItem('mxlumes_user'));
    if (!user || !user.email) { 
        pendingCheckout = true; 
        openGuestCheckoutModal(); 
        return; 
    }

    const amountFixed = checkoutTotal.toFixed(2);
    const payeeName = encodeURIComponent("M-X Lumes");
    const baseParams = `pa=${MERCHANT_UPI_ID}&pn=${payeeName}&am=${amountFixed}&cu=INR&tn=Resin%20Order`;
    
    document.getElementById('upi-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent('upi://pay?' + baseParams)}`;
    document.getElementById('payment-total').innerText = `₹${checkoutTotal.toLocaleString()}`;
    
    toggleCart(); 
    document.getElementById('payment-modal-overlay').classList.add('active');
    lockScroll();
    
    document.getElementById('payment-error-msg').style.display = 'none';
}

function closePaymentModal() { 
    blurInputs();
    document.getElementById('payment-modal-overlay').classList.remove('active'); 
    unlockScroll();
    
    isVerifying = false;
    window.paymentIntentFired = null;
    document.getElementById('payment-error-msg').style.display = 'none';
    
    const btn = document.getElementById('pay-confirm-btn');
    btn.style.display = 'block';
    btn.disabled = false;
    btn.innerText = "✓ I Have Completed The Payment";
    btn.onclick = finalizeOrder; 
    btn.style.background = "var(--accent)";
    btn.style.color = "#fff";
    btn.classList.remove('pulse-btn-accent', 'pulse-btn-green');
    
    const trustMsg = document.getElementById('trust-msg-block');
    if(trustMsg) trustMsg.remove();
}

async function finalizeOrder() {
    const btn = document.getElementById('pay-confirm-btn');
    const errBox = document.getElementById('payment-error-msg');
    
    if (isVerifying || btn.disabled) return;
    isVerifying = true;
    vibrate(50);
    
    btn.classList.remove('pulse-btn-accent');
    btn.innerText = "Verifying with Bank API...";
    btn.disabled = true; 
    errBox.style.display = 'none';

    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('mxlumes_user'));
    } catch(e){}

    if (!user || !user.email) {
        errBox.innerText = "⚠ Session expired. Please close this and securely re-enter your delivery details.";
        errBox.style.display = 'block';
        btn.innerText = "✓ Try Verification Again";
        btn.disabled = false;
        isVerifying = false;
        logout(new Event('click')); 
        return;
    }

    const payload = { email: user.email, items: cart, totalAmount: checkoutTotal, location: userLocation };

    try {
        const response = await fetch(`${RENDER_URL}/api/orders`, { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('mxlumes_token')}` 
            }, 
            body: JSON.stringify(payload) 
        });
        
        if (response.status === 429) throw new Error("System is busy. Please wait 30 seconds.");
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Failed to communicate with server.");

        const trustMsg = document.createElement('div');
        trustMsg.id = "trust-msg-block";
        trustMsg.innerHTML = `<div style="background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success); color: var(--success); padding: 15px; border-radius: 12px; font-size: 13px; line-height: 1.5; margin-bottom: 15px; font-weight: 700; text-align: left;">
            ✅ Payment Logged! Your order <b>${escapeHTML(data.orderId)}</b> has been generated safely. Please send us your invoice receipt on WhatsApp to finalize dispatch.
        </div>`;
        btn.parentNode.insertBefore(trustMsg, btn);

        let msg = `*NEW ORDER RECEIVED: ${data.orderId}*%0AHi M-X Lumes team,%0AI have transferred ₹${checkoutTotal.toLocaleString()} via UPI.%0A%0A`;
        cart.forEach(i => { msg += `• ${i.name} x ${i.qty}%0A`; });
        msg += `%0APlease verify and approve my invoice.`;
        
        cart = []; renderCart(); syncCartWithCloud([]); 
        
        btn.innerText = "Step 2: Send Receipt on WhatsApp";
        btn.style.background = "var(--whatsapp)";
        btn.style.color = "#000";
        btn.classList.add('pulse-btn-green');
        btn.disabled = false;
        btn.onclick = () => {
            vibrate(50);
            window.location.href = `https://wa.me/917668077298?text=${encodeURIComponent(msg)}`;
        };

    } catch (error) { 
        errBox.innerText = "⚠ " + (error.message || "Verification failed. Check network connection.");
        errBox.style.display = 'block';
        btn.innerText = "✓ Try Verification Again";
        btn.disabled = false;
        isVerifying = false;
    }
}

let tickingScroll = false;
window.addEventListener('scroll', () => { 
    if (!tickingScroll) { window.requestAnimationFrame(() => { document.querySelector('.navbar').classList.toggle('scrolled', window.scrollY > 50); tickingScroll = false; }); tickingScroll = true; }
}, {passive: true});
function smoothScroll(id) { document.getElementById(id).scrollIntoView({ behavior: 'smooth' }); }
const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if(entry.isIntersecting) { entry.target.classList.add('active'); } }); }, {threshold: 0.1});
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

let appState = { unit: 'cm', shape: 'rect', ratioA: 3, ratioB: 1, mode: 'cast', scannedArea: 0 };
function setUnit(u) {
    if(appState.unit !== u) {
        const factor = u === 'in' ? 0.3937 : 2.54; 
        ['L', 'W', 'Dia', 'TB', 'TH', 'PB', 'PH', 'SD', 'D'].forEach(key => {
            const inp = document.getElementById('input-'+key); const sli = document.getElementById('slider-'+key);
            if(inp && inp.value) { let val = parseFloat(inp.value) * factor; inp.value = val.toFixed(2); sli.value = val; }
        });
    }
    document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active')); document.getElementById('unit-'+u).classList.add('active'); appState.unit = u; runCalc();
}
function setShape(s) {
    appState.shape = s; document.querySelectorAll('.shape-btn').forEach(i => i.classList.remove('active')); document.getElementById('btn-'+s).classList.add('active');
    ['rect', 'circ', 'tri', 'pyr', 'sph', 'scan'].forEach(k => { const el = document.getElementById('dims-'+k); if(el) el.style.display = 'none'; });
    const activeDims = document.getElementById('dims-'+s); if(activeDims) activeDims.style.display = (s === 'scan') ? 'flex' : 'block';
    document.getElementById('group-depth').style.display = (s === 'sph' || s === 'pyr') ? 'none' : 'block'; runCalc();
}
function sync(id, isSlider = false) { const inp = document.getElementById('input-' + id); const sli = document.getElementById('slider-' + id); if(isSlider) inp.value = sli.value; else sli.value = inp.value; runCalc(); }
function setRatio(a, b, el) { document.querySelectorAll('.ratio-btn').forEach(btn => btn.classList.remove('active')); el.classList.add('active'); document.getElementById('custom-ratio').style.display = 'none'; appState.ratioA = a; appState.ratioB = b; runCalc(); }
function toggleCustomRatio(el) { document.querySelectorAll('.ratio-btn').forEach(btn => btn.classList.remove('active')); el.classList.add('active'); document.getElementById('custom-ratio').style.display = 'flex'; runCalc(); }
function setMode(mode) { appState.mode = mode; document.querySelectorAll('.mode-opt').forEach(opt => opt.classList.remove('active')); document.getElementById('mode-'+mode).classList.add('active'); runCalc(); }
function setPreset(type) {
    if(appState.unit === 'in') setUnit('cm'); 
    if(type === 'varmala') { setShape('rect'); syncSet('L', 30); syncSet('W', 30); syncSet('D', 7.5); setMode('cast'); }
    else if (type === 'clock') { setShape('circ'); syncSet('Dia', 30); syncSet('D', 1); setMode('coat'); }
    else if (type === 'geode') { setShape('circ'); syncSet('Dia', 10); syncSet('D', 0.8); setMode('coat'); }
    else if (type === 'tray') { setShape('rect'); syncSet('L', 30); syncSet('W', 20); syncSet('D', 1.5); setMode('cast'); }
    runCalc();
}
function syncSet(id, val) { document.getElementById('input-'+id).value = val; document.getElementById('slider-'+id).value = val; }

async function autoDetectWeather() {
    const btn = document.querySelector('.auto-btn'); const status = document.getElementById('weather-status'); const intelligence = document.getElementById('weather-intelligence');
    
    btn.disabled = true;
    btn.innerHTML = "🛰️ Triangulating..."; status.style.display = 'block'; status.innerText = "Attempting Satellite Lock...";
    try {
        if(!navigator.geolocation) throw new Error("No Geo");
        const position = await new Promise((resolve, reject) => { navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }); });
        await fetchWeatherData(position.coords.latitude, position.coords.longitude, btn, status, intelligence, "GPS Satellite");
    } catch (gpsError) {
        status.innerText = "GPS blocked. Using IP Fallback...";
        try {
            const ipResponse = await fetch('https://get.geojs.io/v1/ip/geo.json'); const ipData = await ipResponse.json();
            await fetchWeatherData(ipData.latitude, ipData.longitude, btn, status, intelligence, ipData.city || "IP Match");
        } catch (ipError) { handleWeatherError(btn, status, "Connection Blocked"); }
    }
}
async function fetchWeatherData(lat, lon, btn, status, intelligence, sourceLabel) {
    status.innerText = "Downloading Atmospheric Data...";
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m&timezone=auto`);
        if (!response.ok) throw new Error("Weather API Error");
        const data = await response.json(); const tOut = data.current.temperature_2m; const rhOut = data.current.relative_humidity_2m;
        let tIn = tOut; if (tOut > 35) tIn = tOut - 5; else if (tOut < 15) tIn = tOut + 5; 
        const vp = (rhOut / 100) * 6.112 * Math.exp((17.67 * tOut) / (tOut + 243.5)); const vpInSat = 6.112 * Math.exp((17.67 * tIn) / (tIn + 243.5)); let rhIn = Math.min(Math.max((vp / vpInSat) * 100, 20), 99);
        document.getElementById('env-temp').value = Math.round(tIn); document.getElementById('val-temp').innerText = Math.round(tIn) + '°C'; document.getElementById('env-hum').value = Math.round(rhIn); document.getElementById('val-hum').innerText = Math.round(rhIn) + '%';
        runCalc(); btn.innerHTML = "✅ Climate Synced"; status.style.display = 'none'; intelligence.style.display = "block"; btn.disabled = false;
        intelligence.innerHTML = `📍 <b>${escapeHTML(sourceLabel)}</b> | 🛰️ Ext: <b>${tOut}°C</b> / <b>${rhOut}%</b><br>🏠 Int: <b>${Math.round(tIn)}°C</b> / <b>${Math.round(rhIn)}%</b>`;
        setTimeout(() => { btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg> Auto-Detect Conditions'; }, 5000);
    } catch (e) { handleWeatherError(btn, status, "Weather API Offline"); }
}
function handleWeatherError(btn, status, msg) {
    btn.innerHTML = "⚠️ " + msg; status.innerText = "Please use manual sliders."; status.style.color = "var(--warning)";
    setTimeout(() => { btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg> Auto-Detect Conditions'; status.style.display = 'none'; btn.disabled = false; }, 3000);
}

let camStream = null; let polyNodes = []; let draggingNode = null;
async function openScanner() {
    setShape('scan'); const overlay = document.getElementById('smart-scanner'); overlay.style.display = 'flex'; setTimeout(()=> overlay.classList.add('active'), 10); 
    lockScroll(); 
    document.getElementById('btn-capture').style.display = 'block'; document.getElementById('scan-actions').style.display = 'none'; document.getElementById('scan-instruction').style.display = 'block';
    const video = document.getElementById('camera-feed'); const canvas = document.getElementById('scanner-canvas'); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); 
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert("Camera access is blocked or unsupported."); closeScanner(); setShape('rect'); return; }
    try { camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); video.srcObject = camStream; video.onloadedmetadata = () => { video.play(); }; } catch (err) { alert("Please allow camera access to use the AI Scanner."); closeScanner(); setShape('rect'); }
}

function closeScanner() { 
    const overlay = document.getElementById('smart-scanner'); 
    overlay.classList.remove('active'); 
    unlockScroll(); 
    setTimeout(() => { overlay.style.display = 'none'; }, 300); 
    if (camStream) { 
        camStream.getTracks().forEach(track => track.stop()); 
        document.getElementById('camera-feed').srcObject = null;
        camStream = null; 
    } 
}

function retakeScan() { document.getElementById('scan-actions').style.display = 'none'; document.getElementById('btn-capture').style.display = 'block'; document.getElementById('scan-instruction').style.display = 'block'; const video = document.getElementById('camera-feed'); const canvas = document.getElementById('scanner-canvas'); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); video.play(); }
function captureScanFrame() {
    const video = document.getElementById('camera-feed'); const canvas = document.getElementById('scanner-canvas'); const ctx = canvas.getContext('2d');
    canvas.width = video.clientWidth; canvas.height = video.clientHeight; ctx.drawImage(video, 0, 0, canvas.width, canvas.height); video.pause();
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); let d = imgData.data; let w = canvas.width, h = canvas.height;
    let bgR = 0, bgG = 0, bgB = 0; let corners = [0, (w-1)*4, (h-1)*w*4, ((h-1)*w + w - 1)*4]; corners.forEach(c => { bgR+=d[c]; bgG+=d[c+1]; bgB+=d[c+2]; }); bgR/=4; bgG/=4; bgB/=4;
    let minX = w, maxX = 0, minY = h, maxY = 0; const tolerance = 40;
    for(let y=0; y<h; y+=4) { for(let x=0; x<w; x+=4) { let i = (y*w + x)*4; let diff = Math.abs(d[i]-bgR) + Math.abs(d[i+1]-bgG) + Math.abs(d[i+2]-bgB); if(diff > tolerance) { if(x < minX) minX = x; if(x > maxX) maxX = x; if(y < minY) minY = y; if(y > maxY) maxY = y; } } }
    if (minX >= maxX || minY >= maxY || (maxX - minX) < 50) { minX = w * 0.2; maxX = w * 0.8; minY = h * 0.3; maxY = h * 0.7; } else { minX = Math.max(0, minX - 10); maxX = Math.min(w, maxX + 10); minY = Math.max(0, minY - 10); maxY = Math.min(h, maxY + 10); }
    polyNodes = [ {x: minX, y: minY}, {x: maxX, y: minY}, {x: maxX, y: maxY}, {x: minX, y: maxY} ];
    document.getElementById('scan-instruction').style.display = 'none'; document.getElementById('btn-capture').style.display = 'none'; document.getElementById('scan-actions').style.display = 'flex';
    setupCanvasInteraction(canvas, ctx, video); renderInteractivePolygon(canvas, ctx, video);
}
function setupCanvasInteraction(canvas, ctx, video) {
    const getPointerPos = (e) => { let rect = canvas.getBoundingClientRect(); let clientX = e.touches ? e.touches[0].clientX : e.clientX; let clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) }; };
    const downHandler = (e) => { e.preventDefault(); let pos = getPointerPos(e); draggingNode = polyNodes.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 60); if(draggingNode) renderInteractivePolygon(canvas, ctx, video); };
    const moveHandler = (e) => { if(!draggingNode) return; e.preventDefault(); let pos = getPointerPos(e); draggingNode.x = Math.max(0, Math.min(pos.x, canvas.width)); draggingNode.y = Math.max(0, Math.min(pos.y, canvas.height)); renderInteractivePolygon(canvas, ctx, video); };
    const upHandler = () => { draggingNode = null; renderInteractivePolygon(canvas, ctx, video); };
    canvas.addEventListener('mousedown', downHandler); canvas.addEventListener('mousemove', moveHandler); window.addEventListener('mouseup', upHandler); canvas.addEventListener('touchstart', downHandler, {passive: false}); canvas.addEventListener('touchmove', moveHandler, {passive: false}); window.addEventListener('touchend', upHandler);
}
function renderInteractivePolygon(canvas, ctx, video) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height); ctx.moveTo(polyNodes[0].x, polyNodes[0].y); for(let i=1; i<polyNodes.length; i++) ctx.lineTo(polyNodes[i].x, polyNodes[i].y); ctx.closePath(); ctx.fill("evenodd");
    ctx.fillStyle = "rgba(0, 160, 255, 0.3)"; ctx.beginPath(); ctx.moveTo(polyNodes[0].x, polyNodes[0].y); for(let i=1; i<polyNodes.length; i++) ctx.lineTo(polyNodes[i].x, polyNodes[i].y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(polyNodes[0].x, polyNodes[0].y); for(let i=1; i<polyNodes.length; i++) ctx.lineTo(polyNodes[i].x, polyNodes[i].y); ctx.closePath(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(polyNodes[0].x, polyNodes[0].y); ctx.lineTo(polyNodes[1].x, polyNodes[1].y); ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 5; ctx.stroke();
    polyNodes.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI*2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = (p === draggingNode) ? "#ef4444" : "#00a0ff"; ctx.stroke(); });
}
function processCalibration() {
    const inputLen = parseFloat(document.getElementById('scan-line-length').value); const unit = document.getElementById('scan-unit').value;
    if(!inputLen || inputLen <= 0) return alert('Please enter the length of the top red edge.');
    let topEdge = Math.hypot(polyNodes[1].x - polyNodes[0].x, polyNodes[1].y - polyNodes[0].y); let rightEdge = Math.hypot(polyNodes[2].x - polyNodes[1].x, polyNodes[2].y - polyNodes[1].y); let bottomEdge = Math.hypot(polyNodes[2].x - polyNodes[3].x, polyNodes[2].y - polyNodes[3].y); let leftEdge = Math.hypot(polyNodes[3].x - polyNodes[0].x, polyNodes[3].y - polyNodes[0].y);
    let horizontalScale = (topEdge + bottomEdge) / 2; let verticalScale = (leftEdge + rightEdge) / 2;
    let undistortedPixelArea = horizontalScale * verticalScale; let factor = (unit === 'in') ? 2.54 : ((unit === 'mm') ? 0.1 : 1); let realLen_cm = inputLen * factor; let cmPerPixel = realLen_cm / topEdge; let areaCm2 = undistortedPixelArea * Math.pow(cmPerPixel, 2);
    appState.scannedArea = areaCm2; document.getElementById('scan-area-display').innerText = areaCm2.toFixed(1) + ' cm²'; closeScanner(); runCalc();
}

function runCalc() {
    let h = parseFloat(document.getElementById('input-D').value) || 0; let factor = appState.unit === 'in' ? 2.54 : 1; let h_cm = h * factor; let vol = 0;
    if (appState.shape === 'rect') vol = ((parseFloat(document.getElementById('input-L').value)||0) * factor) * ((parseFloat(document.getElementById('input-W').value)||0) * factor) * h_cm;
    else if (appState.shape === 'circ') vol = (Math.PI * Math.pow(((parseFloat(document.
