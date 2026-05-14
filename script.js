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
    else if (appState.shape === 'circ') vol = (Math.PI * Math.pow(((parseFloat(document.getElementById('input-Dia').value)||0) * factor)/2, 2)) * h_cm;
    else if (appState.shape === 'tri') vol = (0.5 * ((parseFloat(document.getElementById('input-TB').value)||0) * factor) * ((parseFloat(document.getElementById('input-TH').value)||0) * factor)) * h_cm;
    else if (appState.shape === 'pyr') { let b = ((parseFloat(document.getElementById('input-PB').value)||0) * factor); let ph = ((parseFloat(document.getElementById('input-PH').value)||0) * factor); vol = (Math.pow(b, 2) * ph) / 3; h_cm = ph; }
    else if (appState.shape === 'sph') { let d = ((parseFloat(document.getElementById('input-SD').value)||0) * factor); vol = (4/3) * Math.PI * Math.pow(d/2, 3); h_cm = d; }
    else if (appState.shape === 'scan') vol = (appState.scannedArea || 0) * h_cm; 

    let rA = appState.ratioA; let rB = appState.ratioB;
    if(document.getElementById('custom-ratio').style.display === 'flex') { rA = parseFloat(document.getElementById('ratioA').value) || 3; rB = parseFloat(document.getElementById('ratioB').value) || 1; }
    const density = parseFloat(document.getElementById('densitySelect').value) || 1.13; const costPerKg = parseFloat(document.getElementById('costInput').value) || 0;
    const mass = vol * density; const totalParts = rA + rB; const massA = (mass * rA) / totalParts; const massB = (mass * rB) / totalParts;

    document.getElementById('res-total').innerText = Math.round(mass) + 'g'; document.getElementById('res-a').innerText = Math.round(massA) + 'g'; document.getElementById('res-b').innerText = Math.round(massB) + 'g';
    if(costPerKg > 0) document.getElementById('est-cost').innerText = '₹' + Math.round((mass/1000)*costPerKg).toLocaleString();

    const temp = parseFloat(document.getElementById('env-temp').value); const hum = parseFloat(document.getElementById('env-hum').value);
    const sList = document.getElementById('safety-list'); const sStatus = document.getElementById('safety-status'); const sCard = document.getElementById('safety-card');
    let limit = appState.mode === 'coat' ? 0.5 : 2.5; let risks = 0; sList.innerHTML = '';

    if (h_cm > limit && appState.shape !== 'sph') { risks++; const layers = Math.ceil(h_cm / limit); sList.innerHTML += `<li class="sr-item" style="color:var(--danger)">⚠️ <b>EXOTHERM:</b> Too deep (${h_cm.toFixed(1)}cm).</li><li class="sr-item" style="color:var(--text-dark)">💡 <b>FIX:</b> Pour ${layers} layers of ${(h_cm/layers).toFixed(1)}cm.</li>`; }
    if (hum > 70) { risks++; sList.innerHTML += `<li class="sr-item" style="color:var(--danger)">💧 <b>BLUSH RISK:</b> High humidity inside.</li><li class="sr-item" style="color:var(--text-dark)">💡 Use AC (Dry Mode) or Dehumidifier.</li>`; }
    if (temp > 30 && h_cm > 2) { risks++; sList.innerHTML += `<li class="sr-item" style="color:var(--warning)">🔥 <b>FLASH CURE:</b> Deep pour + Heat = Cracking.</li>`; }
    if(risks === 0) { sStatus.innerText = "SAFE"; sStatus.style.color = "var(--success)"; sCard.className = "safety-report safe"; sList.innerHTML = `<li class="sr-item"><span>✓</span> Conditions are optimal.</li>`; } 
    else { sStatus.innerText = "ALERT"; sStatus.style.color = "var(--danger)"; sCard.className = "safety-report danger"; }
}

const initialReviews = [ { name: "Sneha Sharma", text: "Absolutely flawless for Varmala preservation. Diamond clear and absolutely no micro-bubbles.", stars: 5 }, { name: "Rahul Verma", text: "The 120-minute pot life is a lifesaver for complex geode pours. Gives me ample time to mix pigments.", stars: 5 }, { name: "Ananya Patel", text: "I was skeptical about the 85 Shore D hardness, but my coasters are practically scratch-proof.", stars: 5 }, { name: "Vikram Singh", text: "Zero VOCs means no headaches! I can finally work in my indoor studio without the strong chemical smell.", stars: 4 }, { name: "Divya Iyer", text: "Best 3:1 epoxy in India hands down. Auto-degassing actually works—I didn't even need my heat gun.", stars: 5 } ];
let selectedStars = 5;

function renderReviews() {
    const container = document.getElementById('reviews-grid'); 
    let storedReviews = [];
    try { storedReviews = JSON.parse(localStorage.getItem('mxlumes_reviews') || '[]'); } catch(e){}
    const allReviews = [...storedReviews, ...initialReviews];
    
    let revHtml = '';
    allReviews.forEach(r => { 
        let starHtml = ''; 
        for(let i=0; i<5; i++) { 
            starHtml += `<svg viewBox="0 0 24 24" style="fill: ${i < r.stars ? '#f59e0b' : '#333'}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`; 
        }
        revHtml += `<div class="r-card"><div class="r-card-stars">${starHtml}</div><div class="r-card-text">"${escapeHTML(r.text)}"</div><div class="r-card-author"><span class="r-verified">✓</span> ${escapeHTML(r.name)}</div></div>`;
    });
    container.innerHTML = revHtml;
}

function openReviewModal() { 
    document.getElementById('review-modal-overlay').classList.add('active'); 
    lockScroll();
}

function closeReviewModal() { 
    blurInputs();
    document.getElementById('review-modal-overlay').classList.remove('active'); 
    unlockScroll();
    selectedStars = 5;
    document.querySelectorAll('#rv-stars svg').forEach(s => s.classList.add('active'));
}

function setupReviewStars() {
    const stars = document.querySelectorAll('#rv-stars svg');
    stars.forEach(star => { star.addEventListener('click', (e) => { selectedStars = parseInt(e.currentTarget.dataset.val); stars.forEach(s => { if(parseInt(s.dataset.val) <= selectedStars) s.classList.add('active'); else s.classList.remove('active'); }); }); });
}

function submitReview() {
    const btn = document.getElementById('rv-submit-btn');
    btn.disabled = true;

    const name = document.getElementById('rv-name').value.trim(); const text = document.getElementById('rv-text').value.trim();
    if(!name || !text) {
        alert("Please enter your name and review.");
        btn.disabled = false;
        return;
    }
    
    let storedReviews = [];
    try { storedReviews = JSON.parse(localStorage.getItem('mxlumes_reviews') || '[]'); } catch(e){}
    
    const newReview = { name: name, text: text, stars: selectedStars }; 
    storedReviews.unshift(newReview); 
    
    if (storedReviews.length > 20) storedReviews.pop();
    
    try { localStorage.setItem('mxlumes_reviews', JSON.stringify(storedReviews)); } catch(e) { console.warn("Storage quota exceeded"); }
    
    document.getElementById('rv-name').value = ''; document.getElementById('rv-text').value = ''; 
    closeReviewModal(); 
    renderReviews(); 
    showToast("Review published!");
    btn.disabled = false;
}

function toggleVijeta() {
    document.getElementById('vGreeting')?.classList.remove('show'); 
    document.getElementById('vijetaPanel').classList.toggle('active');
    if(document.getElementById('vChatBox').innerHTML === "") { renderBotMessage("Namaste! 🙏 I am Vijeta, your official M-X Lumes AI Expert. I can diagnose pouring issues, explain our chemical science, and assist with your resin art. How can I help you today?"); }
}
function handleVijetaEnter(e) { if(e.key === 'Enter') sendVijetaMsg(); }

async function sendVijetaMsg() {
    const input = document.getElementById('vInput'); 
    const text = input.value.trim(); 
    if(!text) return;
    
    const sendBtn = document.getElementById('v-send-btn');
    sendBtn.disabled = true; 

    renderUserMessage(text); input.value = '';
    const chatBox = document.getElementById('vChatBox'); const loadingId = 'loading-' + Date.now();
    chatBox.innerHTML += `<div id="${loadingId}" class="msg bot">Vijeta is thinking... 🧠</div>`; chatBox.scrollTop = chatBox.scrollHeight;
    
    try { 
        const response = await fetch(`${RENDER_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) }); 
        document.getElementById(loadingId)?.remove();
        
        if (response.status === 429) {
            renderBotMessage("I am receiving too many requests right now. Please wait a minute and ask again! ⏳");
        } else if (!response.ok) {
            throw new Error("API Offline");
        } else {
            const data = await response.json(); 
            renderBotMessage(data.reply);
        }
    } catch (error) { 
        document.getElementById(loadingId)?.remove(); 
        renderBotMessage("I'm having a little trouble connecting to my lab right now. Please try again or reach out on WhatsApp! 🛠️"); 
    } finally {
        sendBtn.disabled = false;
    }
}
function renderUserMessage(text) { const chatBox = document.getElementById('vChatBox'); chatBox.innerHTML += `<div class="msg user">${escapeHTML(text)}</div>`; chatBox.scrollTop = chatBox.scrollHeight; }
function renderBotMessage(text) { const chatBox = document.getElementById('vChatBox'); let formattedText = escapeHTML(text).replace(/\n/g, '<br>'); chatBox.innerHTML += `<div class="msg bot" style="white-space: pre-wrap; line-height: 1.5;">${formattedText}</div>`; chatBox.scrollTop = chatBox.scrollHeight; }

let adminClicks = 0;
let adminTimer = null;
function triggerAdmin() {
    adminClicks++;
    clearTimeout(adminTimer);
    adminTimer = setTimeout(() => { adminClicks = 0; }, 800);
    if(adminClicks >= 3) {
        document.getElementById('supreme-admin-portal').style.display = 'block';
        adminClicks = 0;
        if (sessionStorage.getItem('mxlumes_admin_key')) {
            document.getElementById('master-key').value = sessionStorage.getItem('mxlumes_admin_key');
            unlockDashboard();
        }
    }
}

function closeAdminPortal() { document.getElementById('supreme-admin-portal').style.display = 'none'; }

let globalOrders = []; let globalUsers = []; let globalProducts = [];

async function unlockDashboard() {
    const input = document.getElementById('master-key').value;
    if(!input) return;
    
    const btn = document.getElementById('admin-login-btn');
    btn.disabled = true;
    btn.innerText = "Decrypting...";
    document.getElementById('admin-auth-err').style.display = 'none';
    
    try {
        const [orderRes, userRes, prodRes] = await Promise.all([
            fetch(`${RENDER_URL}/api/admin/orders`, { headers: { 'admin-secret-key': input } }),
            fetch(`${RENDER_URL}/api/admin/users`, { headers: { 'admin-secret-key': input } }),
            fetch(`${RENDER_URL}/api/admin/products`, { headers: { 'admin-secret-key': input } })
        ]);

        if (!orderRes.ok || !userRes.ok) throw new Error("Invalid Key");
        
        globalOrders = await orderRes.json();
        globalUsers = await userRes.json();
        globalProducts = await prodRes.json();

        sessionStorage.setItem('mxlumes_admin_key', input);
        document.getElementById('admin-auth-gate').style.display = 'none';
        document.getElementById('admin-main-view').style.display = 'flex';
        
        await fetchFounderLedger();
        populateAdminDashboard();
    } catch (err) {
        document.getElementById('admin-auth-err').style.display = 'block';
        sessionStorage.removeItem('mxlumes_admin_key');
    } finally {
        btn.disabled = false;
        btn.innerText = "Decrypt Vault";
    }
}

// ====== FOUNDERS LEDGER ======
let founderTxList = []; 

async function fetchFounderLedger() {     
    const key = sessionStorage.getItem('mxlumes_admin_key');     
    try {         
        const res = await fetch(`${RENDER_URL}/api/admin/founders-ledger`, { headers: { 'admin-secret-key': key } });         
        if(res.ok) {             
            founderTxList = await res.json();             
            renderFounderLedger();         
        }     
    } catch(e) {         
        showToast("Failed to sync ledger from server", true);     
    } 
}

function openFounderTxModal(editId = null) {
    document.getElementById('ftm-edit-id').value = editId || '';
    document.getElementById('ftm-title').innerText = editId ? 'Edit Transaction' : 'Add Transaction';
    if (editId) {
        const tx = founderTxList.find(t => t.id === editId);
        if (!tx) return;
        document.getElementById('ftm-date').value = tx.date;
        document.getElementById('ftm-from').value = tx.from;
        document.getElementById('ftm-to').value = tx.to;
        document.getElementById('ftm-type').value = tx.type;
        document.getElementById('ftm-amount').value = tx.amount;
        document.getElementById('ftm-note').value = tx.note;
        document.getElementById('ftm-status').value = tx.status;
    } else {
        document.getElementById('ftm-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('ftm-from').value = 'Mukul';
        document.getElementById('ftm-to').value = 'Mahima';
        document.getElementById('ftm-type').value = 'given';
        document.getElementById('ftm-amount').value = '';
        document.getElementById('ftm-note').value = '';
        document.getElementById('ftm-status').value = 'pending';
    }
    document.getElementById('founder-tx-modal').style.display = 'flex';
}

function closeFounderTxModal() {
    document.getElementById('founder-tx-modal').style.display = 'none';
}

async function saveFounderTx() {
    const btn = document.querySelector('#founder-tx-modal button:last-child');
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    btn.disabled = true;

    const editId = document.getElementById('ftm-edit-id').value;
    const amount = Number(document.getElementById('ftm-amount').value) || 0;
    const note = document.getElementById('ftm-note').value.trim();
    const key = sessionStorage.getItem('mxlumes_admin_key');

    if (amount <= 0) { alert('Enter a valid amount.'); btn.disabled = false; btn.innerText = originalText; return; }
    if (!note) { alert('Enter a purpose/note.'); btn.disabled = false; btn.innerText = originalText; return; }

    const txPayload = {
        date: document.getElementById('ftm-date').value,
        from: document.getElementById('ftm-from').value,
        to: document.getElementById('ftm-to').value,
        type: document.getElementById('ftm-type').value,
        amount: amount,
        note: note,
        status: document.getElementById('ftm-status').value
    };

    try {
        const url = editId ? `${RENDER_URL}/api/admin/founders-ledger/${editId}` : `${RENDER_URL}/api/admin/founders-ledger`;
        const method = editId ? 'PUT' : 'POST';
        
        await fetch(url, { 
            method, 
            headers: { 'Content-Type': 'application/json', 'admin-secret-key': key }, 
            body: JSON.stringify(txPayload) 
        });
        
        closeFounderTxModal();
        await fetchFounderLedger(); 
    } catch (e) {
        alert("Failed to save transaction to cloud.");
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

async function deleteFounderTx(id) {
    if (!confirm('Delete this transaction?')) return;
    const key = sessionStorage.getItem('mxlumes_admin_key');
    try {
        await fetch(`${RENDER_URL}/api/admin/founders-ledger/${id}`, { method: 'DELETE', headers: { 'admin-secret-key': key } });
        await fetchFounderLedger();
    } catch(e) {
        alert("Failed to delete.");
    }
}

function renderFounderLedger() {
    const pF = document.getElementById('ft-filter-person')?.value || 'all';
    const tF = document.getElementById('ft-filter-type')?.value || 'all';
    const filtered = founderTxList.filter(tx => (pF === 'all' || tx.from === pF || tx.to === pF) && (tF === 'all' || tx.type === tF));
    
    let mukulOwes = 0, mahimaOwes = 0;
    
    founderTxList.forEach(tx => {
        if (tx.status === 'settled') return;
        if (tx.from === 'Mukul' && tx.to === 'Mahima') mahimaOwes += tx.amount;
        if (tx.from === 'Mahima' && tx.to === 'Mukul') mukulOwes += tx.amount;
    });

    document.getElementById('ft-total-count').innerText = founderTxList.length;
    document.getElementById('ft-total-vol').innerText = '₹' + founderTxList.reduce((s, t) => s + t.amount, 0).toLocaleString();
    
    // Automatic Net Settlement Logic
    let netDifference = mukulOwes - mahimaOwes;
    if (netDifference > 0) {
        document.getElementById('ft-mukul-owes').innerText = '₹' + netDifference.toLocaleString() + ' (To Mahima)';
        document.getElementById('ft-mahima-owes').innerText = 'Settled ✓';
        document.getElementById('ft-mukul-owes').style.color = '#ef4444';
        document.getElementById('ft-mahima-owes').style.color = '#10b981';
    } else if (netDifference < 0) {
        document.getElementById('ft-mahima-owes').innerText = '₹' + Math.abs(netDifference).toLocaleString() + ' (To Mukul)';
        document.getElementById('ft-mukul-owes').innerText = 'Settled ✓';
        document.getElementById('ft-mahima-owes').style.color = '#ef4444';
        document.getElementById('ft-mukul-owes').style.color = '#10b981';
    } else {
        document.getElementById('ft-mukul-owes').innerText = 'All Clear ✓';
        document.getElementById('ft-mahima-owes').innerText = 'All Clear ✓';
        document.getElementById('ft-mukul-owes').style.color = '#10b981';
        document.getElementById('ft-mahima-owes').style.color = '#10b981';
    }

    const icons = { given:'💸', taken:'🤝', due:'⏳', settled:'✅', expense:'🧾', investment:'📈' };
    const sColors = { pending:'#ef4444', partial:'#f59e0b', settled:'#10b981' };
    const sLabels = { pending:'🔴 Pending', partial:'🟡 Partial', settled:'🟢 Settled' };
    const tbody = document.getElementById('ft-tbody');
    
    if (!filtered.length) { 
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#555;padding:40px;">No transactions match this filter.</td></tr>'; 
        return; 
    }
    
    tbody.innerHTML = filtered.map((tx, i) => `
        <tr style="border-bottom:1px solid #1a1a1a;">
            <td style="padding:15px;color:#555;">${i + 1}</td>
            <td style="padding:15px;color:#888;white-space:nowrap;">${tx.date || '—'}</td>
            <td style="padding:15px;"><b style="color:#fff;">${escapeHTML(tx.from)}</b> <span style="color:#555;">→</span> <b style="color:#6366f1;">${escapeHTML(tx.to)}</b></td>
            <td style="padding:15px;"><span style="background:rgba(99,102,241,0.15);border:1px solid #6366f1;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;color:#a5b4fc;">${icons[tx.type] || ''} ${tx.type}</span></td>
            <td style="padding:15px;font-weight:800;font-size:16px;color:#10b981;">₹${Number(tx.amount).toLocaleString()}</td>
            <td style="padding:15px;color:#aaa;max-width:200px;">${escapeHTML(tx.note)}</td>
            <td style="padding:15px;color:${sColors[tx.status]};font-weight:800;font-size:12px;">${sLabels[tx.status]}</td>
            <td style="padding:15px;">
                <button onclick="openFounderTxModal('${tx.id}')" style="background:transparent;border:1px solid #555;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;margin-right:5px;">✎</button>
                <button onclick="deleteFounderTx('${tx.id}')" style="background:rgba(239,68,68,0.1);border:1px solid #ef4444;color:#ef4444;padding:6px 10px;border-radius:6px;cursor:pointer;">✕</button>
            </td>
        </tr>`).join('');
}

function exportFounderCSV() {
    if (!founderTxList.length) { alert('No transactions to export.'); return; }
    const rows = [['#','Date','From','To','Type','Amount','Purpose','Status']];
    founderTxList.forEach((tx, i) => rows.push([i+1, tx.date, tx.from, tx.to, tx.type, tx.amount, tx.note, tx.status]));
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})), download: 'founders_ledger.csv' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function lockVault() {
    sessionStorage.removeItem('mxlumes_admin_key'); document.getElementById('master-key').value = '';
    document.getElementById('admin-auth-gate').style.display = 'flex'; document.getElementById('admin-main-view').style.display = 'none';
    closeAdminPortal();
}

async function fetchAdminData() {
    const key = sessionStorage.getItem('mxlumes_admin_key'); if(!key) return;
    const btn = document.getElementById('admin-sync-btn');
    btn.disabled = true;
    btn.innerText = "Syncing...";
    try {
        const [orderRes, userRes, prodRes, ledgerRes] = await Promise.all([
            fetch(`${RENDER_URL}/api/admin/orders`, { headers: { 'admin-secret-key': key } }),
            fetch(`${RENDER_URL}/api/admin/users`, { headers: { 'admin-secret-key': key } }),
            fetch(`${RENDER_URL}/api/admin/products`, { headers: { 'admin-secret-key': key } }),
            fetch(`${RENDER_URL}/api/admin/founders-ledger`, { headers: { 'admin-secret-key': key } }).catch(() => ({ok: false})) 
        ]);
        
        globalOrders = await orderRes.json();
        globalUsers = await userRes.json();
        globalProducts = await prodRes.json();
        if(ledgerRes.ok) founderTxList = await ledgerRes.json();
        
        populateAdminDashboard();
        renderFounderLedger();
    } catch(e) {
        console.error("Sync failed");
        showToast("API sync failed. Retrying...", true);
    } finally {
        btn.disabled = false;
        btn.innerText = "⟳ Sync Data";
    }
}

// 🖨️ ADVANCED PDF GENERATOR ENGINE
function generateAdminPDF(tabName, targetId) {
    const el = document.getElementById(targetId);
    if(!el) return alert("Nothing to print.");
    
    const clone = el.cloneNode(true);
    
    if(clone.tagName.toLowerCase() === 'TABLE') {
        const rows = clone.querySelectorAll('tr');
        rows.forEach(row => {
            // Strip Action Columns
            if(row.lastElementChild && (row.lastElementChild.innerText.match(/Action|Actions/i) || row.lastElementChild.querySelector('button'))) {
                row.removeChild(row.lastElementChild);
            }
            // Flatten Inputs and Selects
            row.querySelectorAll('select, input').forEach(inputEl => {
                let textVal = inputEl.value || '';
                if(inputEl.tagName.toLowerCase() === 'SELECT' && inputEl.selectedIndex >= 0) {
                    textVal = inputEl.options[inputEl.selectedIndex].text;
                }
                const textNode = document.createTextNode(textVal);
                inputEl.parentNode.replaceChild(textNode, inputEl);
            });
        });
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>M-X Lumes - ${tabName} Report</title>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 30px; color: #111; line-height: 1.5; }
            h1 { color: #000; text-align: center; text-transform: uppercase; letter-spacing: 2px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 5px; font-size: 24px; }
            .date { text-align: right; font-size: 11px; color: #555; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #f4f4f5; color: #000; text-align: left; padding: 12px 10px; border: 1px solid #ddd; text-transform: uppercase; }
            td { padding: 12px 10px; border: 1px solid #e5e7eb; vertical-align: top; word-wrap: break-word; max-width: 200px; }
            .inv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
            .inv-card { border: 1px solid #ccc; padding: 15px; border-radius: 8px; text-align: center; page-break-inside: avoid; }
            .inv-img { width: 100%; height: 120px; object-fit: cover; margin-bottom: 10px; filter: grayscale(100%); }
            button { display: none !important; }
            @page { size: landscape; margin: 15mm; }
        </style>
        </head><body>
        <h1>${tabName} Report</h1>
        <div class="date">Generated on: ${new Date().toLocaleString()}</div>
        ${clone.outerHTML}
        <script>setTimeout(() => { window.print(); window.close(); }, 500);<\/script>
        </body></html>
    `);
    printWindow.document.close();
}

// 💰 MASTER RENDER FUNCTION
function populateAdminDashboard() {
    let totalRev = 0; let totalGlobalCost = 0; let totalGlobalProfit = 0;

    const oBody = document.getElementById('admin-orders-tbody');
    const lBody = document.getElementById('admin-logistics-tbody');
    const fBody = document.getElementById('admin-finance-tbody');
    const pGrid = document.getElementById('admin-inventory-grid');
    
    let oHtml = ''; let lHtml = ''; let pHtml = ''; let fHtml = '';
    let searchFilter = document.getElementById('order-search') ? document.getElementById('order-search').value.toLowerCase() : '';
    let filteredOrders = globalOrders;
    
    if(searchFilter) { 
        filteredOrders = filteredOrders.filter(o => 
            (o.orderId?.toLowerCase().includes(searchFilter)) || 
            (o.customerEmail?.toLowerCase().includes(searchFilter)) || 
            (o.transactionDetails?.toLowerCase().includes(searchFilter)) || 
            (o.trackingNumber?.toLowerCase().includes(searchFilter)) 
        ); 
    }

    if(filteredOrders.length === 0) { 
        oHtml = '<tr><td colspan="4" style="text-align:center; color:#888;">No orders found.</td></tr>'; 
        lHtml = '<tr><td colspan="4" style="text-align:center; color:#888;">No orders found.</td></tr>'; 
        fHtml = '<tr><td colspan="6" style="text-align:center; color:#888;">No financial records found.</td></tr>';
    } else {
        filteredOrders.forEach(o => {
            let userPhone = ''; let userAddress = '<span style="color:#ef4444;">Address Not Provided</span>'; 
            let linkedUser = globalUsers.find(u => u.email === o.customerEmail); 
            let resolvedUserObj = { name: 'Guest User', email: o.customerEmail, phone: '', address: '' };
            
            if(linkedUser) {
                resolvedUserObj.name = linkedUser.name || 'User';
                if(linkedUser.phone) { userPhone = escapeHTML(linkedUser.phone); resolvedUserObj.phone = linkedUser.phone; }
                if(linkedUser.address) { userAddress = escapeHTML(linkedUser.address); resolvedUserObj.address = linkedUser.address; }
            }
            let statusClass = 'Pending'; if(o.status.includes('Processing')) statusClass = 'Processing'; if(o.status.includes('Shipped')) statusClass = 'Shipped'; if(o.status.includes('Delivered')) statusClass = 'Delivered';
            let selectColor = o.status === 'Pending Verification' ? '#ef4444' : (o.status === 'Processing' ? '#6366f1' : '#10b981');
            
            const safeItemsAdmin = JSON.stringify(o.items || []).replace(/"/g, '&quot;');
            const txEncAdmin = encodeURIComponent(o.transactionDetails || '').replace(/'/g, "%27");
            const userEncAdmin = encodeURIComponent(JSON.stringify(resolvedUserObj)).replace(/'/g, "%27");

            // 💰 FINANCE MATH ENGINE
            const rev = Number(o.totalAmount) || 0;
            const cRaw = Number(o.costRawMaterial) || 0;
            const cLabel = Number(o.costLabeling) || 0;
            const cShip = Number(o.costShipping) || 0;
            const totalCost = cRaw + cLabel + cShip;
            const netProfit = rev - totalCost;
            const margin = rev > 0 ? ((netProfit / rev) * 100).toFixed(1) : 0;
            const wKG = Number(o.totalWeightKg) || 0;
            const perKg = wKG > 0 ? (rev / wKG).toFixed(0) : 0;

            if (o.status !== 'Pending Verification') { 
                totalRev += rev; totalGlobalCost += totalCost; totalGlobalProfit += netProfit; 
            }

            // 1. ORDERS TAB
            oHtml += `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding:15px; vertical-align:top;">
                        <div style="font-family:'Space Grotesk', sans-serif; font-weight:800; color:#fff;">${escapeHTML(o.orderId)}</div>
                        <div style="color:#888; font-size:11px; margin-top:4px;">${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}</div>
                        <div style="color:#888; font-size:11px; margin-top:4px;">Geo: ${escapeHTML(o.location) || 'Unknown'}</div>
                    </td>
                    <td style="padding:15px; vertical-align:top;">
                        <div style="color:#fff; font-weight:700;">${escapeHTML(o.customerEmail)}</div>
                        <div style="color:#aaa; font-size:11px; margin-top:6px; line-height:1.4; max-width:220px; word-wrap: break-word;">📍 ${userAddress}</div>
                        ${userPhone ? `<a href="https://wa.me/91${userPhone}?text=Hi!%20Update%20regarding%20your%20M-X%20Lumes%20order%20${encodeURIComponent(o.orderId)}:" target="_blank" style="color:var(--whatsapp); text-decoration:none; font-size:11px; display:inline-block; margin-top:6px; border:1px solid var(--whatsapp); padding:3px 6px; border-radius:4px;">WhatsApp</a>` : ''}
                    </td>
                    <td style="padding:15px; vertical-align:top; font-weight:800; color:var(--success);">₹${rev.toLocaleString()}</td>
                    <td style="padding:15px; vertical-align:top;">
                        <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                            <select onchange="updateOrderStatus('${escapeHTML(o.orderId)}', this.value, this)" style="background:#000; color:${selectColor}; border:1px solid ${selectColor}; padding:6px; border-radius:6px; outline:none; font-size:11px; font-weight:800; cursor:pointer;" data-original="${o.status}">
                                <option value="Pending Verification" ${o.status === 'Pending Verification' ? 'selected' : ''}>Pending (Unpaid)</option>
                                <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Paid & Processing</option>
                                <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                                <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                            </select>
                            <button onclick="adminEditOrder('${escapeHTML(o.orderId)}')" style="background:transparent; border:1px solid #555; color:#fff; padding:6px; border-radius:6px; cursor:pointer;">✎ Edit</button>
                            <button onclick="printInvoice('${escapeHTML(o.orderId)}', '${o.createdAt || 'N/A'}', ${o.totalAmount}, '${safeItemsAdmin}', '${txEncAdmin}', '${userEncAdmin}')" style="background:transparent; border:1px solid #6366f1; color:#6366f1; padding:6px; border-radius:6px; cursor:pointer;">🖨️ Invoice</button>
                            <button onclick="adminDeleteOrder('${escapeHTML(o.orderId)}', this)" style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#ef4444; padding:6px; border-radius:6px; cursor:pointer;">✕ Del</button>
                        </div>
                    </td>
                </tr>
            `;

            // 2. LOGISTICS TAB
            if (o.status !== 'Pending Verification') {
                let liveTrackUrl = "";
                let awbClean = escapeHTML(o.trackingNumber || '');
                let cour = escapeHTML(o.courierCompany || '');
                
                if (awbClean && awbClean !== "Pending") {
                    if (cour === "Delhivery") liveTrackUrl = `https://www.delhivery.com/track/package/${awbClean}`;
                    else if (cour === "DTDC") liveTrackUrl = `https://www.dtdc.in/`; 
                    else if (cour === "Trackon") liveTrackUrl = `https://trackon.in/Tracking/Tracking_results?TrackingNumber=${awbClean}`;
                    else if (cour === "India Post") liveTrackUrl = `https://www.indiapost.gov.in/`;
                    else liveTrackUrl = `https://parcelsapp.com/track/${awbClean}`; 
                }

                let trackBtnHtml = liveTrackUrl ? `<button onclick="window.open('${liveTrackUrl}', '_blank')" style="background:#10b981; color:#000; padding:8px; border-radius:8px; cursor:pointer; border:none; font-size:12px; font-weight:800;">📍 Track</button>` : '';

                // ⚠️ STUCK IN TRANSIT ALERT LOGIC
                let transitAlert = '';
                if (o.status === 'Shipped' && o.createdAt) {
                    const daysInTransit = Math.floor((new Date() - new Date(o.createdAt)) / (1000 * 60 * 60 * 24));
                    if (daysInTransit > 4) {
                        transitAlert = `<div style="background:rgba(245,158,11,0.1); color:#f59e0b; border:1px solid #f59e0b; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:800; margin-top:8px; display:inline-block;">⚠️ ALERT: IN TRANSIT ${daysInTransit} DAYS</div>`;
                    }
                }

                lHtml += `
                    <tr style="border-bottom: 1px solid #333;">
                        <td style="padding:15px; vertical-align:top;">
                            <div style="font-family:'Space Grotesk', sans-serif; font-weight:800; color:#fff;">${escapeHTML(o.orderId)}</div>
                            <div style="color:#888; font-size:11px; margin-top:4px;">${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}</div>
                            <div style="margin-top:8px; font-size:11px; font-weight:800; padding:4px 8px; border-radius:4px; display:inline-block; border: 1px solid ${selectColor}; color: ${selectColor};">${escapeHTML(o.status)}</div><br>
                            ${transitAlert}
                        </td>
                        <td style="padding:15px; vertical-align:top;">
                            <div style="color:#fff; font-weight:700;">${escapeHTML(resolvedUserObj.name)}</div>
                            <div style="color:#aaa; font-size:11px; margin-top:4px;">${escapeHTML(resolvedUserObj.phone || 'No Phone')}</div>
                            <div style="color:#888; font-size:11px; margin-top:6px; line-height:1.4; max-width:250px; word-wrap: break-word;">📍 ${userAddress}</div>
                        </td>
                        <td style="padding:15px; vertical-align:top;">
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <select id="courier-${escapeHTML(o.orderId)}" style="background:#000; color:#fff; border:1px solid #555; padding:8px; border-radius:8px; font-size:12px; outline:none; width: 200px;">
                                    <option value="">Select Courier...</option>
                                    <option value="Delhivery" ${cour === 'Delhivery' ? 'selected' : ''}>Delhivery</option>
                                    <option value="DTDC" ${cour === 'DTDC' ? 'selected' : ''}>DTDC</option>
                                    <option value="Trackon" ${cour === 'Trackon' ? 'selected' : ''}>Trackon</option>
                                    <option value="Fship" ${cour === 'Fship' ? 'selected' : ''}>Fship</option>
                                    <option value="Shipmozo" ${cour === 'Shipmozo' ? 'selected' : ''}>Shipmozo</option>
                                    <option value="India Post" ${cour === 'India Post' ? 'selected' : ''}>India Post</option>
                                    <option value="Other" ${cour === 'Other' ? 'selected' : ''}>Other</option>
                                </select>
                                <input type="text" id ="awb-${escapeHTML(o.orderId)}" value="${awbClean}" placeholder="AWB / Tracking Number" style="background:#000; color:#fff; border:1px solid #555; padding:8px; border-radius:8px; font-size:12px; outline:none; width: 200px;">
                            </div>
                        </td>
                        <td style="padding:15px; vertical-align:top;">
                            <div style="display:flex; flex-direction:column; gap:8px; width: 120px;">
                                <button id="btn-save-log-${escapeHTML(o.orderId)}" onclick="saveTracking('${escapeHTML(o.orderId)}')" style="background:var(--accent); color:#fff; padding:8px; border-radius:8px; font-size:12px; font-weight:800; cursor:pointer; border:none;">Save</button>
                                <button onclick="sendTrackingWhatsApp('${escapeHTML(o.orderId)}')" style="background:var(--whatsapp); color:#000; padding:8px; border-radius:8px; font-size:12px; font-weight:800; cursor:pointer; border:none; display:flex; align-items:center; justify-content:center; gap:5px;">Notify</button>
                                ${trackBtnHtml}
                            </div>
                        </td>
                    </tr>
                `;
            }

            // 3. FINANCE TAB
            let profitColor = netProfit >= 0 ? '#10b981' : '#ef4444';
            fHtml += `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding:15px; vertical-align:middle;">
                        <div style="font-family:'Space Grotesk', font-weight:800; color:#fff;">${escapeHTML(o.orderId)}</div>
                        <div style="color:#888; font-size:11px; margin-top:4px;">${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}</div>
                    </td>
                    <td style="padding:15px; vertical-align:middle; color:#fff; font-weight:700; font-size:16px;">₹${rev.toLocaleString()}</td>
                    <td style="padding:15px; vertical-align:middle; color:#888; font-size:12px; line-height:1.6;">
                        Raw: ₹${cRaw}<br>Lbl: ₹${cLabel}<br>Ship: ₹${cShip}<br>
                        <strong style="color:#ccc; display:inline-block; margin-top:4px; padding-top:4px; border-top:1px solid #444;">Total Costs: ₹${totalCost}</strong>
                    </td>
                    <td style="padding:15px; vertical-align:middle; color:#ccc;">${wKG} kg</td>
                    <td style="padding:15px; vertical-align:middle; color:${profitColor}; font-weight:800; font-size:16px;">₹${netProfit.toLocaleString()}</td>
                    <td style="padding:15px; vertical-align:middle; color:#6366f1; font-weight:700; font-size:14px;">
                        ${margin}%<br><span style="font-size:11px; color:#888;">(₹${perKg}/kg)</span>
                    </td>
                </tr>
            `;
        });
    }
    
    // Render Orders & Logistics
    if(oBody) oBody.innerHTML = oHtml;
    if(lBody) lBody.innerHTML = lHtml;
    if(fBody) fBody.innerHTML = fHtml;

    // RENDER PROFESSIONAL INVENTORY ENGINE
    if(pGrid) {
        let totalStockValue = 0;
        let activeProducts = 0;
        let tableRows = '';

        let avgMargin = totalRev > 0 ? ((totalGlobalProfit / totalRev) * 100).toFixed(1) : 0;

        if(globalProducts.length === 0) {
            tableRows = `<tr><td colspan="6" style="text-align:center; color:#888;">No products found. Add one above.</td></tr>`;
        } else {
            globalProducts.forEach(p => {
                if (p.inStock) activeProducts++;
                let actualQty = p.stockQty || 0; 
                let potentialRev = p.currentPrice * actualQty;
                let potentialProfit = potentialRev * (avgMargin / 100);
                totalStockValue += potentialRev;

                let statusUI = p.inStock ? `<span style="color:#10b981; font-weight:800;">✓ Active</span>` : `<span style="color:#ef4444; font-weight:800;">✕ Out of Stock</span>`;

                tableRows += `
                    <tr style="border-bottom: 1px solid #333;">
                        <td style="padding:15px; display:flex; align-items:center; gap:10px;">
                            <img src="${escapeHTML(p.image)}" style="width:40px; height:40px; border-radius:6px; object-fit:cover;" onerror="this.src='product-1.webp'">
                            <div>
                                <div style="font-weight:800; color:#fff;">${escapeHTML(p.name)}</div>
                                <div style="font-size:10px; color:#888; text-transform:uppercase;">${escapeHTML(p.tag)}</div>
                            </div>
                        </td>
                        <td style="padding:15px; color:#ccc;">${statusUI}</td>
                        <td style="padding:15px; font-weight:700; color:#fff;">₹${p.currentPrice.toLocaleString()}</td>
                        <td style="padding:15px; color:#fff; font-weight:800; font-size:16px;">${actualQty} <span style="font-size:10px; font-weight:400; color:#888;">units</span></td>
                        <td style="padding:15px; font-weight:800; color:var(--accent);">₹${Math.round(potentialProfit).toLocaleString()} <span style="font-size:10px; color:#555;">(Proj.)</span></td>
                        <td style="padding:15px;">
                            <button onclick="adminEditProduct('${p._id}')" style="background:transparent; border:1px solid #555; color:#fff; padding:6px; border-radius:6px; cursor:pointer; margin-right:5px;">✎ Edit</button>
                            <button onclick="adminDeleteProduct('${p._id}', this)" style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#ef4444; padding:6px; border-radius:6px; cursor:pointer;">✕</button>
                        </td>
                    </tr>
                `;
            });
        }

        // Inject the new Stock Dashboard HTML
        let totalProjectedProfit = totalStockValue * (avgMargin / 100);
        
        pHtml = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom:20px;">
            <div class="admin-stat-card"><div style="color:#888; font-size:11px; text-transform:uppercase; font-weight:800;">Active Catalog</div><div style="font-size:36px; font-weight:800;">${activeProducts}</div></div>
            <div class="admin-stat-card"><div style="color:#888; font-size:11px; text-transform:uppercase; font-weight:800;">Est. Stock Value</div><div style="font-size:36px; font-weight:800; color:#fff;">₹${totalStockValue.toLocaleString()}</div></div>
            <div class="admin-stat-card"><div style="color:#888; font-size:11px; text-transform:uppercase; font-weight:800;">Projected Stock Profit</div><div style="font-size:36px; font-weight:800; color:var(--accent);">₹${Math.round(totalProjectedProfit).toLocaleString()}</div></div>
        </div>
        <div style="background:#0a0a0a; border:1px solid #333; border-radius:16px; overflow-x:auto;">
            <table style="width:100%; min-width:800px; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#000;">
                        <th style="padding:15px; color:#888; text-align:left;">Product</th>
                        <th style="padding:15px; color:#888; text-align:left;">Status</th>
                        <th style="padding:15px; color:#888; text-align:left;">Price</th>
                        <th style="padding:15px; color:#888; text-align:left;">Real Qty</th>
                        <th style="padding:15px; color:#888; text-align:left;">Projected Profit</th>
                        <th style="padding:15px; color:#888; text-align:left;">Actions</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
        `;
        pGrid.style.display = 'block'; // Remove grid layout so table flows normally
        pGrid.innerHTML = pHtml;
    }

    // STATS UPDATE
    const statRev = document.getElementById('stat-revenue');
    if(statRev) statRev.innerText = '₹' + totalRev.toLocaleString();
    
    const statOrd = document.getElementById('stat-orders');
    if(statOrd) statOrd.innerText = globalOrders.length;
    
    const statUsers = document.getElementById('stat-users');
    if(statUsers) statUsers.innerText = globalUsers.length;
    
    const statNet = document.getElementById('stat-net-profit');
    if(statNet) statNet.innerText = '₹' + totalGlobalProfit.toLocaleString();
    
    const statCost = document.getElementById('stat-total-costs');
    if(statCost) statCost.innerText = '₹' + totalGlobalCost.toLocaleString();
    
    let avgMargin = totalRev > 0 ? ((totalGlobalProfit / totalRev) * 100).toFixed(1) : 0;
    const statMargin = document.getElementById('stat-avg-margin');
    if(statMargin) statMargin.innerText = avgMargin + '%';

    // USERS TAB
    const uBody = document.getElementById('admin-users-tbody');
    if (uBody) {
        let uHtml = '';
        globalUsers.forEach(u => {
            uHtml += `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding:15px; font-weight:800; color:#fff;">${escapeHTML(u.name)}</td>
                    <td style="padding:15px; color:#aaa;">${escapeHTML(u.email)}</td>
                    <td style="padding:15px;">
                        ${u.phone ? escapeHTML(u.phone) : '<span style="color:#555;">No Phone</span>'}
                        <div style="font-size: 11px; color: #888; margin-top: 5px; max-width: 250px; line-height: 1.4;">
                            📍 ${u.address ? escapeHTML(u.address) : 'No address provided'}
                        </div>
                    </td>
                    <td style="padding:15px; display:flex; gap:5px;">
                        <button onclick="adminEditUser('${u._id}')" style="background:transparent; border:1px solid #555; color:#fff; padding:6px; border-radius:6px; cursor:pointer;">✎</button>
                        <button onclick="adminDeleteUser('${escapeHTML(u.email)}', this)" style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#ef4444; padding:6px; border-radius:6px; cursor:pointer;">✕</button>
                    </td>
                </tr>
            `;
        });
        uBody.innerHTML = uHtml;
    }
}

function adminSwitchTab(tabId, el) {
    document.querySelectorAll('.admin-nav-item').forEach(t => t.classList.remove('active')); el.classList.add('active');
    document.querySelectorAll('.admin-data-panel').forEach(p => p.style.display = 'none'); document.getElementById('admin-panel-' + tabId).style.display = 'block';
}

async function updateOrderStatus(orderId, newStatus, selectEl) {
    const key = sessionStorage.getItem('mxlumes_admin_key');
    const oldStatus = selectEl.getAttribute('data-original');
    selectEl.disabled = true;
    try { 
        const response = await fetch(`${RENDER_URL}/api/admin/orders/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'admin-secret-key': key }, body: JSON.stringify({ orderId, status: newStatus }) }); 
        if (!response.ok) throw new Error("API Failure");
        selectEl.setAttribute('data-original', newStatus);
        fetchAdminData(); 
    } catch (e) { 
        alert("Failed to update status. Reverting."); 
        selectEl.value = oldStatus;
    } finally {
        selectEl.disabled = false;
    }
}

async function adminDeleteOrder(id, btnEl) {
    if(!confirm(`Delete order ${id}?`)) return;
    btnEl.disabled = true;
    const key = sessionStorage.getItem('mxlumes_admin_key'); 
    try {
        await fetch(`${RENDER_URL}/api/admin/orders/${id}`, { method: 'DELETE', headers: { 'admin-secret-key': key } }); 
        fetchAdminData();
    } catch(e) { btnEl.disabled = false; }
}

async function adminDeleteUser(email, btnEl) {
    if(!confirm(`Are you sure you want to delete user ${email}? This cannot be undone.`)) return;
    btnEl.disabled = true;
    const key = sessionStorage.getItem('mxlumes_admin_key'); 
    try {
        const response = await fetch(`${RENDER_URL}/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE', headers: { 'admin-secret-key': key } });
        const data = await response.json();
        if (response.ok) {
            showToast("User deleted successfully");
            fetchAdminData(); 
        } else {
            alert("Error: " + data.message);
            btnEl.disabled = false;
        }
    } catch (e) {
        alert("Failed to reach server. Check your connection.");
        btnEl.disabled = false;
    }
}

function closeAdminEditModal() {
    document.getElementById('admin-edit-modal').style.display = 'none';
}

function adminEditOrder(id) {
    const order = globalOrders.find(o => o.orderId === id); if(!order) return;
    document.getElementById('admin-edit-title').innerText = `Edit Order: ${id}`;
    document.getElementById('admin-edit-fields').innerHTML = `
        <label style="font-size:12px; color:#888;">Total Revenue (₹)</label>
        <input type="number" id="ae-amt" value="${order.totalAmount || 0}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;">
        <label style="font-size:12px; color:#888;">Email</label>
        <input type="text" id="ae-email" value="${escapeHTML(order.customerEmail)}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;">
        
        <h4 style="font-size:12px; color:#fff; margin-top:15px; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">Finance & Logistics Metrics</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div><label style="font-size:10px; color:#888;">Raw Material Cost (₹)</label><input type="number" id="ae-cost-raw" value="${order.costRawMaterial || 0}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;"></div>
            <div><label style="font-size:10px; color:#888;">Labeling Cost (₹)</label><input type="number" id="ae-cost-label" value="${order.costLabeling || 0}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;"></div>
            <div><label style="font-size:10px; color:#888;">Shipping Cost (₹)</label><input type="number" id="ae-cost-ship" value="${order.costShipping || 0}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;"></div>
            <div><label style="font-size:10px; color:#888;">Total Weight (KG)</label><input type="number" id="ae-weight" value="${order.totalWeightKg || 0}" step="0.1" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;"></div>
        </div>

        <label style="font-size:12px; color:#888;">Transaction Details (Prints on Invoice)</label>
        <textarea id="ae-tx" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; border-radius:8px; height:60px; font-family:inherit; margin-bottom:10px;" placeholder="e.g. Paid via UPI Ref: 123456789">${escapeHTML(order.transactionDetails || '')}</textarea>
    `;
    document.getElementById('admin-edit-modal').style.display = 'flex';
    
    const btn = document.getElementById('admin-edit-save');
    btn.onclick = async () => {
        const key = sessionStorage.getItem('mxlumes_admin_key');
        btn.disabled = true;
        btn.innerText = 'Saving...';
        try {
            await fetch(`${RENDER_URL}/api/admin/orders/${id}`, { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json', 'admin-secret-key': key }, 
                body: JSON.stringify({ 
                    totalAmount: Number(document.getElementById('ae-amt').value), 
                    customerEmail: document.getElementById('ae-email').value, 
                    transactionDetails: document.getElementById('ae-tx').value, 
                    trackingNumber: order.trackingNumber, 
                    courierCompany: order.courierCompany,
                    costRawMaterial: Number(document.getElementById('ae-cost-raw').value),
                    costLabeling: Number(document.getElementById('ae-cost-label').value),
                    costShipping: Number(document.getElementById('ae-cost-ship').value),
                    totalWeightKg: Number(document.getElementById('ae-weight').value)
                }) 
            });
            closeAdminEditModal(); 
            fetchAdminData();
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save';
        }
    };
}

function adminEditUser(id) {
    const user = globalUsers.find(u => u._id === id); if(!user) return;
    document.getElementById('admin-edit-title').innerText = `Edit User`;
    document.getElementById('admin-edit-fields').innerHTML = `<label style="font-size:12px; color:#888;">Name</label><input type="text" id="ae-u-name" value="${escapeHTML(user.name)}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;"><label style="font-size:12px; color:#888;">Phone</label><input type="text" id="ae-u-phone" value="${escapeHTML(user.phone)}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; border-radius:8px;">`;
    document.getElementById('admin-edit-modal').style.display = 'flex';
    
    const btn = document.getElementById('admin-edit-save');
    btn.onclick = async () => {
        const key = sessionStorage.getItem('mxlumes_admin_key');
        btn.disabled = true;
        btn.innerText = 'Saving...';
        try {
            await fetch(`${RENDER_URL}/api/admin/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'admin-secret-key': key }, body: JSON.stringify({ name: document.getElementById('ae-u-name').value, phone: document.getElementById('ae-u-phone').value }) });
            closeAdminEditModal(); 
            fetchAdminData();
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save';
        }
    };
}

// 📦 INVENTORY MANAGEMENT LOGIC
function adminEditProduct(id) {
    let p = { name: '', tag: 'Premium Kit', image: 'product-1.webp', description: '', originalPrice: 0, currentPrice: 0, inStock: true, stockQty: 0 };
    if (id !== 'new') p = globalProducts.find(x => x._id === id) || p;

    document.getElementById('admin-edit-title').innerText = id === 'new' ? 'Add New Product' : 'Edit Product';
    document.getElementById('admin-edit-fields').innerHTML = `
        <label style="font-size:11px; color:#888;">Product Name</label><input type="text" id="ep-name" value="${escapeHTML(p.name)}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;">
        <label style="font-size:11px; color:#888;">Badge/Tag (e.g. Best Seller)</label><input type="text" id="ep-tag" value="${escapeHTML(p.tag)}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;">
        <label style="font-size:11px; color:#888;">Image Filename</label><input type="text" id="ep-img" value="${escapeHTML(p.image)}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;">
        <label style="font-size:11px; color:#888;">Description</label><textarea id="ep-desc" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px; height:60px; font-family:inherit;">${escapeHTML(p.description)}</textarea>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
            <div><label style="font-size:11px; color:#888;">Orig. Price (₹)</label><input type="number" id="ep-orig" value="${p.originalPrice}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;"></div>
            <div><label style="font-size:11px; color:#888;">Curr. Price (₹)</label><input type="number" id="ep-curr" value="${p.currentPrice}" style="width:100%; background:#000; border:1px solid #333; color:#fff; padding:10px; margin-bottom:10px; border-radius:8px;"></div>
            <div><label style="font-size:11px; color:var(--accent); font-weight:800;">Real Stock Qty</label><input type="number" id="ep-qty" value="${p.stockQty || 0}" style="width:100%; background:rgba(99,102,241,0.1); border:1px solid var(--accent); color:#fff; padding:10px; margin-bottom:10px; border-radius:8px; font-weight:800;"></div>
        </div>
        <label style="display:flex; align-items:center; gap:10px; margin-top:10px; cursor:pointer; color:#fff; font-size:14px;">
            <input type="checkbox" id="ep-stock" style="width:20px; height:20px; margin:0;" ${p.inStock ? 'checked' : ''}> Catalog Visible (Toggle to hide from frontend)
        </label>
    `;
    document.getElementById('admin-edit-modal').style.display = 'flex';

    const btn = document.getElementById('admin-edit-save');
    btn.onclick = async () => {
        const key = sessionStorage.getItem('mxlumes_admin_key');
        btn.disabled = true; btn.innerText = 'Saving...';
        
        const payload = {
            name: document.getElementById('ep-name').value, tag: document.getElementById('ep-tag').value,
            image: document.getElementById('ep-img').value, description: document.getElementById('ep-desc').value,
            originalPrice: document.getElementById('ep-orig').value, currentPrice: document.getElementById('ep-curr').value,
            inStock: document.getElementById('ep-stock').checked, stockQty: Number(document.getElementById('ep-qty').value) || 0
        };

        const url = id === 'new' ? `${RENDER_URL}/api/admin/products` : `${RENDER_URL}/api/admin/products/${id}`;
        const method = id === 'new' ? 'POST' : 'PUT';

        try {
            await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'admin-secret-key': key }, body: JSON.stringify(payload) });
            closeAdminEditModal(); fetchAdminData(); fetchLiveInventory(); 
        } finally { btn.disabled = false; btn.innerText = 'Save'; }
    };
}

async function adminDeleteProduct(id, btnEl) {
    if(!confirm(`Delete this product? This will remove it from the website.`)) return;
    btnEl.disabled = true; const key = sessionStorage.getItem('mxlumes_admin_key'); 
    try {
        await fetch(`${RENDER_URL}/api/admin/products/${id}`, { method: 'DELETE', headers: { 'admin-secret-key': key } }); 
        fetchAdminData(); fetchLiveInventory();
    } catch(e) { btnEl.disabled = false; }
}

async function saveTracking(orderId) {
    const order = globalOrders.find(o => o.orderId === orderId); if(!order) return;
    const awb = document.getElementById(`awb-${orderId}`).value.trim(); const courier = document.getElementById(`courier-${orderId}`).value; const key = sessionStorage.getItem('mxlumes_admin_key');
    const btn = document.getElementById(`btn-save-log-${orderId}`); btn.innerText = "⏳";
    try {
        const response = await fetch(`${RENDER_URL}/api/admin/orders/${orderId}`, { 
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'admin-secret-key': key }, 
            body: JSON.stringify({ 
                totalAmount: order.totalAmount, customerEmail: order.customerEmail, transactionDetails: order.transactionDetails, 
                trackingNumber: awb, courierCompany: courier, costRawMaterial: order.costRawMaterial, costLabeling: order.costLabeling, costShipping: order.costShipping, totalWeightKg: order.totalWeightKg
            }) 
        });
        if (!response.ok) throw new Error("Save failed");
        order.trackingNumber = awb; order.courierCompany = courier; btn.innerText = "✓ Saved"; setTimeout(()=> btn.innerText = "Save", 2000);
    } catch(e) { btn.innerText = "Error"; setTimeout(()=> btn.innerText = "Save", 2000); }
}

function sendTrackingWhatsApp(orderId) {
    const order = globalOrders.find(o => o.orderId === orderId); if(!order) return;
    const user = globalUsers.find(u => u.email === order.customerEmail); if (!user || !user.phone) return alert("Customer phone number is missing.");
    const awb = order.trackingNumber || "Pending"; const courier = order.courierCompany || "Assigned Courier"; let trackingLink = "";

    if (awb === "Pending") {
        trackingLink = "Your tracking number will be updated shortly.";
    } else if (courier === "Delhivery") {
        trackingLink = `https://www.delhivery.com/track/package/${awb}`;
    } else if (courier === "DTDC") {
        trackingLink = `https://www.dtdc.in/  (Enter AWB: ${awb})`; 
    } else if (courier === "Trackon") {
        trackingLink = `https://trackon.in/Tracking/Tracking_results?TrackingNumber=${awb}`;
    } else if (courier === "India Post") {
        trackingLink = `https://www.indiapost.gov.in/  (Enter AWB: ${awb})`;
    } else {
        trackingLink = `Tracking AWB: ${awb} (Please check via courier website)`;
    }

    let firstName = user.name.split(' ')[0] || "Artist";
    let msg = `*M-X LUMES DISPATCH UPDATE* 🚚%0A%0AHi ${firstName}, your premium resin order *${order.orderId}* has been dispatched!%0A%0A*Courier:* ${courier}%0A*AWB Number:* ${awb}%0A%0A*Track your shipment here:*%0A${trackingLink}%0A%0AThank you for creating with M-X Lumes! ✨`;
    window.open(`https://wa.me/91${user.phone}?text=${msg}`, '_blank');
}

function exportOrdersCSV() {
    if(globalOrders.length === 0) return alert("No orders.");
    let csvContent = "Order ID,Date,Email,Phone,Shipping Address,Amount,Raw Cost,Label Cost,Ship Cost,Weight KG,Net Profit,Margin %,Status,Transaction Details,Courier,AWB\n";
    globalOrders.forEach(o => { 
        let u = globalUsers.find(user => user.email === o.customerEmail); let phone = u && u.phone ? u.phone : 'No Phone';
        let rawAddress = u && u.address ? u.address : 'No Address'; let safeAddress = rawAddress.replace(/"/g, '""'); 
        let rawTx = o.transactionDetails ? o.transactionDetails : ''; let safeTx = rawTx.replace(/"/g, '""').replace(/\n/g, ' ');
        let dateStr = o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A';
        
        const cRaw = o.costRawMaterial || 0; const cLabel = o.costLabeling || 0; const cShip = o.costShipping || 0; const totalCost = cRaw + cLabel + cShip;
        const rev = o.totalAmount || 0; const netProfit = rev - totalCost; const margin = rev > 0 ? ((netProfit / rev) * 100).toFixed(1) : 0; const weight = o.totalWeightKg || 0;

        csvContent += `"${o.orderId}","${dateStr}","${o.customerEmail}","${phone}","${safeAddress}",${rev},${cRaw},${cLabel},${cShip},${weight},${netProfit},${margin},"${o.status}","${safeTx}","${o.courierCompany || ''}","${o.trackingNumber || ''}"\n`; 
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", `mxlumes_orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// 💎 VIP MANUAL ORDER ENGINE
let vipCart = [];

function openVIPOrderModal() {
    document.getElementById('vip-order-modal').classList.add('active');
    lockScroll();
    vipCart = [];
    document.getElementById('vip-phone').value = '';
    document.getElementById('vip-name').value = '';
    document.getElementById('vip-email').value = '';
    document.getElementById('vip-address').value = '';
    document.getElementById('vip-discount-name').value = 'One-Time VIP Referral Discount';
    document.getElementById('vip-discount-amt').value = '0';
    
    const select = document.getElementById('vip-product-select');
    select.innerHTML = '<option value="">Select a Product...</option>';
    globalProducts.forEach(p => {
        select.innerHTML += `<option value="${escapeHTML(p.name)}" data-price="${p.currentPrice}">${escapeHTML(p.name)} - ₹${p.currentPrice}</option>`;
    });
    renderVIPCart();
}

function closeVIPOrderModal() {
    document.getElementById('vip-order-modal').classList.remove('active');
    unlockScroll();
}

function addVIPItem() {
    const select = document.getElementById('vip-product-select');
    const qty = parseInt(document.getElementById('vip-qty').value) || 1;
    if(select.selectedIndex <= 0) return;
    
    const opt = select.options[select.selectedIndex];
    const name = opt.value;
    const price = parseFloat(opt.getAttribute('data-price'));
    
    const existing = vipCart.find(i => i.name === name);
    if(existing) existing.qty += qty;
    else vipCart.push({ name, price, qty });
    
    renderVIPCart();
}

function removeVIPItem(name) {
    vipCart = vipCart.filter(i => i.name !== name);
    renderVIPCart();
}

function renderVIPCart() {
    const display = document.getElementById('vip-cart-display');
    let html = '';
    let subtotal = 0;
    vipCart.forEach(item => {
        subtotal += item.price * item.qty;
        html += `<div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:13px; color:#ccc;">
            <span>${item.qty}x ${escapeHTML(item.name)}</span>
            <span>₹${(item.price * item.qty).toLocaleString()} <button onclick="removeVIPItem('${escapeHTML(item.name)}')" style="color:#ef4444; margin-left:10px; cursor:pointer; border:none; background:transparent;">✕</button></span>
        </div>`;
    });
    display.innerHTML = html;
    
    const discountAmt = Math.abs(Number(document.getElementById('vip-discount-amt').value)) || 0;
    let finalTotal = subtotal - discountAmt;
    if(finalTotal < 0) finalTotal = 0;
    
    document.getElementById('vip-final-total').innerText = `₹${finalTotal.toLocaleString()}`;
}

async function submitVIPOrder() {
    const phone = document.getElementById('vip-phone').value.trim();
    const name = document.getElementById('vip-name').value.trim();
    const email = document.getElementById('vip-email').value.trim();
    const address = document.getElementById('vip-address').value.trim();
    
    const discountName = document.getElementById('vip-discount-name').value.trim();
    const discountAmount = Number(document.getElementById('vip-discount-amt').value) || 0;
    const btn = document.getElementById('btn-submit-vip');

    if(!phone || phone.length < 10) return alert("A valid 10-digit Phone Number is required to identify the customer.");
    if(vipCart.length === 0) return alert("Please add at least one product.");

    btn.disabled = true;
    btn.innerText = "Generating & Syncing...";
    const key = sessionStorage.getItem('mxlumes_admin_key');

    try {
        const response = await fetch(`${RENDER_URL}/api/admin/orders/manual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'admin-secret-key': key },
            body: JSON.stringify({ phone, name, email, address, items: vipCart, discountName, discountAmount })
        });

        if(!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || "Failed to create VIP order");
        }

        showToast("VIP Order Generated & Linked to User!");
        closeVIPOrderModal();
        fetchAdminData(); 
    } catch(e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Confirm & Generate Order";
    }
}
