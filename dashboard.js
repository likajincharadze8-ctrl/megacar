document.addEventListener('DOMContentLoaded', function() {
    // 1. SESSION GUARD
    const sessionData = sessionStorage.getItem('mai_user');
    if (!sessionData) { window.location.replace('login.html'); return; }
    
    const userData = JSON.parse(sessionData);
    const role = String(userData.role || '').toLowerCase();
    const currentUsername = userData.username;

    // Attach the login token as an Authorization header on every same-origin API call.
    // Mobile browsers (especially iOS Safari / in-app browsers / PWAs) can be unreliable
    // about sending the auth cookie, so this header is a robust fallback the backend also accepts.
    if (userData.token && !window._maiFetchPatched) {
        window._maiFetchPatched = true;
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, init = {}) => {
            const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
            if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + userData.token);
            return originalFetch(input, { ...init, headers });
        };
    }

    // 2. DOM ELEMENTS
    const userDisplay = document.getElementById('user-display');
    const carGrid = document.getElementById('carGrid');
    const addCarForm = document.getElementById('addCarForm');
    const addUserForm = document.getElementById('addUserForm');
    
    const sidebar = document.getElementById('sidebar');
    const mobileMenuBtn = document.getElementById('mobileMenuToggle');

    const tabs = { 
        garage: document.getElementById('tabGarage'), 
        addCar: document.getElementById('tabAddCar'), 
        users: document.getElementById('tabUsers'),
        stats: document.getElementById('tabStats'),
        invoices: document.getElementById('tabInvoices'),
        financing: document.getElementById('tabFinancing'),
        profitShare: document.getElementById('tabProfitShare')
    };
    const views = { 
        garage: document.getElementById('viewGarage'), 
        addCar: document.getElementById('viewAddCar'), 
        users: document.getElementById('viewUsers'),
        stats: document.getElementById('viewStats'),
        invoices: document.getElementById('viewInvoices'),
        financing: document.getElementById('viewFinancing'),
        profitShare: document.getElementById('viewProfitShare')
    };

    // Invoices DOM
    const invoicesTableBody = document.getElementById('invoicesTableBody');
    const addInvoiceForm = document.getElementById('addInvoiceForm');
    const newInvoiceBtn = document.getElementById('newInvoiceBtn');
    const cancelInvoiceBtn = document.getElementById('cancelInvoiceBtn');

    // Financing DOM
    const financingTableBody = document.getElementById('financingTableBody');
    const addFinancingForm = document.getElementById('addFinancingForm');
    const newFinancingBtn = document.getElementById('newFinancingBtn');
    const cancelFinancingBtn = document.getElementById('cancelFinancingBtn');

    // Profit Share DOM
    const profitShareTableBody = document.getElementById('profitShareTableBody');
    const addProfitShareForm = document.getElementById('addProfitShareForm');
    const newProfitShareBtn = document.getElementById('newProfitShareBtn');
    const cancelProfitShareBtn = document.getElementById('cancelProfitShareBtn');

    const carModal = document.getElementById('carModal');
    const closeModal = document.getElementById('closeModal');
    const modalBody = document.getElementById('modalBody');

    window.maiCars = []; 

    // 3. UI SETUP & MOBILE TOGGLE
    if (userDisplay) userDisplay.innerText = `${role.toUpperCase()} (${currentUsername})`;
    const carDealerInput = document.getElementById('carDealer');
    if (role !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        if (carDealerInput) {
            carDealerInput.value = currentUsername;
            carDealerInput.readOnly = true;
            carDealerInput.title = 'Dealers can only assign cars to themselves.';
        }
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.onclick = () => sidebar?.classList.toggle('active');
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 992) sidebar?.classList.remove('active');
        });
    });

    function showSection(name) {
        Object.values(views).forEach(v => v?.classList.add('hidden'));
        Object.values(tabs).forEach(t => t?.classList.remove('active'));
        if (views[name]) views[name].classList.remove('hidden');
        if (tabs[name]) tabs[name].classList.add('active');
        if (name === 'garage') loadCars();
        if (name === 'stats') loadStats();
        if (name === 'invoices') loadInvoices();
        if (name === 'financing') loadFinancing();
        if (name === 'profitShare') loadProfitShares();
    }

    if (tabs.garage) tabs.garage.onclick = (e) => { e.preventDefault(); showSection('garage'); };
    if (tabs.addCar) tabs.addCar.onclick = (e) => { e.preventDefault(); showSection('addCar'); };
    if (tabs.users) tabs.users.onclick = (e) => { e.preventDefault(); showSection('users'); };
    if (tabs.stats) tabs.stats.onclick = (e) => { e.preventDefault(); showSection('stats'); };
    if (tabs.invoices) tabs.invoices.onclick = (e) => { e.preventDefault(); showSection('invoices'); };
    if (tabs.financing) tabs.financing.onclick = (e) => { e.preventDefault(); showSection('financing'); };
    if (tabs.profitShare) tabs.profitShare.onclick = (e) => { e.preventDefault(); showSection('profitShare'); };

    // 4. GLOBAL API FUNCTIONS (Attached explicitly to window so buttons can find them)
    window.deleteCar = async (id) => {
        if (!confirm("Delete vehicle permanently? This will also delete the uploaded files.")) return;
        await fetch(`/api/cars/${id}`, { method: 'DELETE' });
        loadCars();
    };

    window.featureCar = async (id) => {
        if (!confirm("Set as Deal of the Day?")) return;
        await fetch(`/api/cars/${id}/feature`, { method: 'PATCH' });
        loadCars();
    };

    window.updateCarStatus = async (carId, newStatus) => {
        await fetch(`/api/cars/${carId}/status`, { 
            method: 'PATCH', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ status: newStatus }) 
        });
        loadCars();
    };

    window.uploadDoc = async (carId) => {
        const fileInput = document.getElementById(`newDocFile-${carId}`);
        const titleInput = document.getElementById(`newDocTitle-${carId}`);
        if (!fileInput || !fileInput.files.length) return alert("Select a file.");
        const formData = new FormData();
        for (let i = 0; i < fileInput.files.length; i++) formData.append('docs', fileInput.files[i]);
        if (titleInput && titleInput.value.trim()) formData.append('title', titleInput.value.trim());
        try {
            const res = await fetch(`/api/cars/${carId}/documents`, { method: 'PATCH', body: formData });
            const payload = await res.json().catch(() => null);
            if (!res.ok) { alert(payload?.error || 'დოკუმენტის ატვირთვა ვერ მოხერხდა.'); return; }
            await loadCars();
            const updated = window.maiCars.find(c => c._id === carId);
            if (updated) window.openCarMenu(updated);
        } catch (err) {
            console.error('Document upload failed.', err);
            alert('დოკუმენტის ატვირთვა ვერ მოხერხდა.');
        }
    };

    window.submitEditCar = async (e, carId) => {
        e.preventDefault();
        const payload = {
            makeModel: document.getElementById('editMake').value,
            auctionPrice: document.getElementById('editAuction').value,
            transportPrice: document.getElementById('editTransport').value,
            amountPaid: document.getElementById('editPaid').value,
            recipientFirstName: document.getElementById('editRecFirst').value,
            recipientLastName: document.getElementById('editRecLast').value,
            recipientId: document.getElementById('editRecId').value,
            recipientPhone: document.getElementById('editRecPhone').value,
            purchaseDate: document.getElementById('editPurchaseDate').value,
            auctionName: document.getElementById('editAuctionName').value,
            buyLocation: document.getElementById('editBuyLocation').value,
            vin: document.getElementById('editVin').value,
            lotNumber: document.getElementById('editLot').value,
            dealerId: document.getElementById('editDealer').value,
            containerNumber: document.getElementById('editContainerNum').value,
            containerCode: document.getElementById('editContainerCode').value
        };

        const res = await fetch(`/api/cars/${carId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) { 
            alert("Details Updated!"); 
            if (carModal) carModal.classList.add('hidden'); 
            loadCars(); 
        }
    };

    window.showEditForm = (carId) => {
        const car = window.maiCars.find(c => c._id === carId);
        if (!car || !modalBody) return;

        modalBody.innerHTML = `
            <h2 style="color: #ffcc00; font-size: 24px; margin-bottom: 20px;">Edit: ${car.makeModel}</h2>
            <form id="editCarForm" onsubmit="window.submitEditCar(event, '${car._id}')">
                <div class="form-group"><label>Make & Model</label><input type="text" id="editMake" value="${car.makeModel}" required></div>
                
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:1"><label>Auction Price</label><input type="number" id="editAuction" value="${car.auctionPrice || 0}"></div>
                    <div class="form-group" style="flex:1"><label>Transport Price</label><input type="number" id="editTransport" value="${car.transportPrice || 0}"></div>
                    <div class="form-group" style="flex:1"><label>Client Paid</label><input type="number" id="editPaid" value="${car.amountPaid || 0}"></div>
                </div>

                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:1"><label>Rec. First Name</label><input type="text" id="editRecFirst" value="${car.recipientFirstName || ''}"></div>
                    <div class="form-group" style="flex:1"><label>Rec. Last Name</label><input type="text" id="editRecLast" value="${car.recipientLastName || ''}"></div>
                    <div class="form-group" style="flex:1"><label>Rec. ID Number</label><input type="text" id="editRecId" value="${car.recipientId || ''}"></div>
                    <div class="form-group" style="flex:1"><label>Rec. Phone</label><input type="text" id="editRecPhone" value="${car.recipientPhone || ''}"></div>
                </div>

                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:1"><label>Purchase Date</label><input type="date" id="editPurchaseDate" value="${car.purchaseDate || ''}"></div>
                    <div class="form-group" style="flex:1"><label>Auction Name</label>
                        <select id="editAuctionName">
                            <option value="Copart" ${car.auctionName === 'Copart'?'selected':''}>Copart</option>
                            <option value="IAAI" ${car.auctionName === 'IAAI'?'selected':''}>IAAI</option>
                            <option value="Manheim" ${car.auctionName === 'Manheim'?'selected':''}>Manheim</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex:1"><label>Buy Location</label><input type="text" id="editBuyLocation" value="${car.buyLocation || ''}"></div>
                </div>

                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:1"><label>VIN Number</label><input type="text" id="editVin" value="${car.vin}" required></div>
                    <div class="form-group" style="flex:1"><label>Lot Number</label><input type="text" id="editLot" value="${car.lotNumber || ''}"></div>
                    <div class="form-group" style="flex:1"><label>Assigned Dealer</label><input type="text" id="editDealer" value="${car.dealerId}" ${role === 'admin' ? '' : 'readonly'} required></div>
                </div>

                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <div class="form-group" style="flex:1"><label>Container Number</label><input type="text" id="editContainerNum" value="${car.containerNumber || ''}"></div>
                    <div class="form-group" style="flex:1"><label>Container Code</label><input type="text" id="editContainerCode" value="${car.containerCode || ''}"></div>
                </div>
                
                <button type="submit" class="btn-primary" style="margin-top:20px;">Save Changes</button>
                <button type="button" class="btn-primary" style="background:#444; margin-top:10px;" onclick="document.getElementById('carModal').classList.add('hidden')">Cancel</button>
            </form>
        `;
    };

    // 5. LOAD CARS
    async function loadCars() {
        if (!carGrid) return;
        try {
            const res = await fetch('/api/cars');
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error || 'Failed to load cars');
            const cars = Array.isArray(payload) ? payload : [];
            carGrid.innerHTML = '';
            
            const myCars = role === 'admin' ? cars : cars.filter(c => c.dealerId === currentUsername);
            window.maiCars = myCars;

            myCars.forEach(car => {
                const card = document.createElement('div');
                card.classList.add('car-card');
                if(car.isFeatured) card.style.border = '1px solid #ffcc00';
                
                const firstImg = car.images?.[0] || '';
                const previewImg = typeof firstImg === 'string'
                    ? (firstImg.startsWith('/uploads/') || firstImg.startsWith('http') ? firstImg : (firstImg ? `/uploads/${firstImg}` : ''))
                    : (firstImg.url || '');

                const totalCost = (car.auctionPrice || 0) + (car.transportPrice || 0);
                const leftToPay = totalCost - (car.amountPaid || 0);
                const balanceColor = leftToPay > 0 ? '#ff4444' : '#00C851'; 
                
                card.innerHTML = `
                    <div class="car-image">
                        ${previewImg ? `<img src="${previewImg}">` : '<div style="padding:20px; text-align:center; color:#555;">No Photo</div>'}
                        ${role === 'admin' ? `<button style="position:absolute; top:10px; right:40px; background:#111; color:#fff; border:none; padding:5px 10px; cursor:pointer; z-index:10;" onclick="event.stopPropagation(); window.featureCar('${car._id}')">&#9733;</button>` : ''}
                        ${role === 'admin' ? `<button style="position:absolute; top:10px; right:10px; background:#ff4444; color:#fff; border:none; padding:5px 10px; cursor:pointer; z-index:10;" onclick="event.stopPropagation(); window.deleteCar('${car._id}')">&times;</button>` : ''}
                    </div>
                    <div class="car-details">
                        <h4>${car.makeModel}</h4>
                        <p style="color:#aaa; font-size:14px;">Total Cost: $${totalCost.toLocaleString()}</p>
                        <p style="color:#aaa; font-size:14px;">Balance: <strong style="color: ${balanceColor};">$${leftToPay.toLocaleString()}</strong></p>
                        <p style="color:#777; font-size:12px; margin-top:5px;">VIN: ${car.vin}</p>
                        <span class="car-status-badge">${car.status || 'Purchased'}</span>
                    </div>`;
                
                card.onclick = () => window.openCarMenu(car);
                carGrid.appendChild(card);
            });
        } catch (err) {
            console.error('Database connection failed.', err);
            carGrid.innerHTML = '<div style="padding:16px; border:1px solid #333; border-radius:8px; color:#ff7777;">Failed to load cars. Please log in again and refresh.</div>';
        }
    }

    // 5b. STATISTICS
    const STATUS_IN_PROGRESS = ['In Transit', 'At Customs'];
    const STATUS_DONE = ['Arrived', 'Sold'];
    const STATUS_ORDER = ['Purchased', 'In Transit', 'At Customs', 'Arrived', 'Sold'];
    const STATUS_LABELS_KA = {
        'Purchased': 'ნაყიდი',
        'In Transit': 'გზაში',
        'At Customs': 'საბაჟოზე',
        'Arrived': 'ჩამოსული',
        'Sold': 'გაყიდული'
    };

    async function loadStats() {
        const elTotal = document.getElementById('statTotalCars');
        const elTransit = document.getElementById('statInTransit');
        const elDelivered = document.getElementById('statDelivered');
        const elCost = document.getElementById('statTotalCost');
        const elPaid = document.getElementById('statTotalPaid');
        const elBalance = document.getElementById('statTotalBalance');
        const elBreakdown = document.getElementById('statBreakdown');
        if (!elTotal) return;

        try {
            const res = await fetch('/api/cars');
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error || 'Failed to load cars');
            const allCars = Array.isArray(payload) ? payload : [];
            const myCars = role === 'admin' ? allCars : allCars.filter(c => c.dealerId === currentUsername);

            const totalCost = myCars.reduce((s, c) => s + (c.auctionPrice || 0) + (c.transportPrice || 0), 0);
            const totalPaid = myCars.reduce((s, c) => s + (c.amountPaid || 0), 0);
            const totalBalance = totalCost - totalPaid;

            const inTransitCount = myCars.filter(c => STATUS_IN_PROGRESS.includes(c.status)).length;
            const deliveredCount = myCars.filter(c => STATUS_DONE.includes(c.status)).length;

            elTotal.textContent = myCars.length;
            elTransit.textContent = inTransitCount;
            elDelivered.textContent = deliveredCount;
            elCost.textContent = '$' + totalCost.toLocaleString();
            elPaid.textContent = '$' + totalPaid.toLocaleString();
            elBalance.textContent = '$' + totalBalance.toLocaleString();
            elBalance.style.color = totalBalance > 0 ? 'var(--red)' : 'var(--green)';

            if (elBreakdown) {
                const counts = {};
                STATUS_ORDER.forEach(s => counts[s] = 0);
                myCars.forEach(c => { const s = c.status || 'Purchased'; counts[s] = (counts[s] || 0) + 1; });
                const max = Math.max(1, ...Object.values(counts));
                elBreakdown.innerHTML = STATUS_ORDER.map(s => {
                    const count = counts[s] || 0;
                    const pct = Math.round((count / max) * 100);
                    return `<div class="breakdown-row">
                        <span class="breakdown-label">${STATUS_LABELS_KA[s] || s}</span>
                        <div class="breakdown-track"><div class="breakdown-fill" style="width:${pct}%"></div></div>
                        <span class="breakdown-count">${count}</span>
                    </div>`;
                }).join('');
            }
        } catch (err) {
            console.error('Failed to load statistics.', err);
            if (elBreakdown) elBreakdown.innerHTML = '<div style="color:var(--red);font-size:13px">სტატისტიკის ჩატვირთვა ვერ მოხერხდა.</div>';
        }
    }

    // 5c. INVOICES
    const STATUS_KA = { 'Paid': 'გადახდილი', 'Partial': 'ნაწილობრივ', 'Unpaid': 'გადასახდელი' };
    const STATUS_CLASS = { 'Paid': 'badge-paid', 'Partial': 'badge-partial', 'Unpaid': 'badge-unpaid' };

    async function loadInvoices() {
        if (!invoicesTableBody) return;
        invoicesTableBody.innerHTML = '<tr><td colspan="9" class="table-empty">იტვირთება…</td></tr>';
        try {
            const res = await fetch('/api/invoices');
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error || 'Failed to load invoices');
            const invoices = Array.isArray(payload) ? payload : [];

            if (invoices.length === 0) {
                invoicesTableBody.innerHTML = '<tr><td colspan="9" class="table-empty">ინვოისები ჯერ არ არსებობს.</td></tr>';
                return;
            }

            invoicesTableBody.innerHTML = invoices.map(inv => {
                const balance = (inv.totalAmount || 0) - (inv.amountPaid || 0);
                const badgeClass = STATUS_CLASS[inv.status] || 'badge-unpaid';
                const statusLabel = STATUS_KA[inv.status] || inv.status;
                const date = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('ka-GE') : '—';
                const vehicle = [inv.makeModel, inv.vin].filter(Boolean).join(' • ') || '—';
                const adminCell = role === 'admin' ? `<td>${inv.dealerId}</td>` : '';
                const deleteBtn = role === 'admin'
                    ? `<button class="icon-btn-sm danger" title="წაშლა" onclick="window.deleteInvoice('${inv._id}')">&times;</button>`
                    : '';
                return `<tr>
                    <td class="mono">${inv.invoiceNumber}</td>
                    ${adminCell}
                    <td>${vehicle}</td>
                    <td>$${(inv.totalAmount || 0).toLocaleString()}</td>
                    <td>$${(inv.amountPaid || 0).toLocaleString()}</td>
                    <td style="color:${balance > 0 ? 'var(--red)' : 'var(--green)'}">$${balance.toLocaleString()}</td>
                    <td><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
                    <td>${date}</td>
                    <td style="white-space:nowrap">
                        <a class="btn-outline btn-sm" href="/api/invoices/${inv._id}/pdf" target="_blank">PDF</a>
                        ${deleteBtn}
                    </td>
                </tr>`;
            }).join('');
        } catch (err) {
            console.error('Failed to load invoices.', err);
            invoicesTableBody.innerHTML = '<tr><td colspan="9" class="table-empty" style="color:var(--red)">ინვოისების ჩატვირთვა ვერ მოხერხდა.</td></tr>';
        }
    }

    window.deleteInvoice = async (id) => {
        if (!confirm('ინვოისის წაშლა? ეს მოქმედება შეუქცევადია.')) return;
        await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
        loadInvoices();
    };

    if (newInvoiceBtn) {
        newInvoiceBtn.onclick = () => addInvoiceForm?.classList.toggle('hidden');
    }
    if (cancelInvoiceBtn) {
        cancelInvoiceBtn.onclick = () => addInvoiceForm?.classList.add('hidden');
    }

    if (addInvoiceForm) {
        addInvoiceForm.onsubmit = async (e) => {
            e.preventDefault();
            const body = {
                dealerId: document.getElementById('invDealer').value,
                makeModel: document.getElementById('invMakeModel').value,
                vin: document.getElementById('invVin').value,
                recipientFirstName: document.getElementById('invRecFirst').value,
                recipientLastName: document.getElementById('invRecLast').value,
                recipientId: document.getElementById('invRecId').value,
                totalAmount: document.getElementById('invTotal').value,
                amountPaid: document.getElementById('invPaid').value,
                description: document.getElementById('invDescription').value
            };
            const res = await fetch('/api/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) {
                alert(payload?.error || 'ინვოისის შექმნა ვერ მოხერხდა.');
                return;
            }
            addInvoiceForm.reset();
            addInvoiceForm.classList.add('hidden');
            loadInvoices();
        };
    }

    // 5d. CO-FINANCING
    async function loadFinancing() {
        if (!financingTableBody) return;
        financingTableBody.innerHTML = '<tr><td colspan="9" class="table-empty">იტვირთება…</td></tr>';
        try {
            const res = await fetch('/api/financings');
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error || 'Failed to load financings');
            const records = Array.isArray(payload) ? payload : [];

            const totalCount = records.length;
            const totalAmount = records.reduce((s, r) => s + (r.financedAmount || 0), 0);
            const outstanding = records.reduce((s, r) => s + Math.max(0, (r.financedAmount || 0) - (r.amountRepaid || 0)), 0);
            const activeCount = records.filter(r => r.status === 'Active').length;
            const paidOffCount = records.filter(r => r.status === 'Paid Off').length;

            const elCount = document.getElementById('finTotalCount');
            const elAmount = document.getElementById('finTotalAmount');
            const elOutstanding = document.getElementById('finOutstanding');
            const elActive = document.getElementById('finActiveCount');
            const elPaidOff = document.getElementById('finPaidOffCount');
            if (elCount) elCount.textContent = totalCount;
            if (elAmount) elAmount.textContent = '$' + totalAmount.toLocaleString();
            if (elOutstanding) elOutstanding.textContent = '$' + outstanding.toLocaleString();
            if (elActive) elActive.textContent = activeCount;
            if (elPaidOff) elPaidOff.textContent = paidOffCount;

            if (records.length === 0) {
                financingTableBody.innerHTML = '<tr><td colspan="9" class="table-empty">ჩანაწერები ჯერ არ არსებობს.</td></tr>';
                return;
            }

            financingTableBody.innerHTML = records.map(r => {
                const remaining = Math.max(0, (r.financedAmount || 0) - (r.amountRepaid || 0));
                const badgeClass = r.status === 'Paid Off' ? 'badge-paid' : 'badge-partial';
                const statusLabel = r.status === 'Paid Off' ? 'დაფარული' : 'აქტიური';
                const adminCell = role === 'admin' ? `<td>${r.dealerId}</td>` : '';
                const feeLabel = `$${(r.fixedFee || 0).toLocaleString()}${r.feePaid ? ' ✓' : ''}`;
                const actions = role === 'admin' ? `
                    <button class="btn-outline btn-sm" onclick="window.addFinancingPayment('${r._id}', ${remaining})">+ გადახდა</button>
                    <button class="icon-btn-sm danger" title="წაშლა" onclick="window.deleteFinancing('${r._id}')">&times;</button>
                ` : '';
                return `<tr>
                    <td class="mono">${r.vin || '—'}</td>
                    <td>${r.carInfo || '—'}</td>
                    ${adminCell}
                    <td>$${(r.financedAmount || 0).toLocaleString()}</td>
                    <td>$${(r.amountRepaid || 0).toLocaleString()}</td>
                    <td style="color:${remaining > 0 ? 'var(--red)' : 'var(--green)'}">$${remaining.toLocaleString()}</td>
                    <td>${feeLabel}</td>
                    <td><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
                    <td style="white-space:nowrap">${actions}</td>
                </tr>`;
            }).join('');
        } catch (err) {
            console.error('Failed to load financing records.', err);
            financingTableBody.innerHTML = '<tr><td colspan="9" class="table-empty" style="color:var(--red)">ჩატვირთვა ვერ მოხერხდა.</td></tr>';
        }
    }

    window.addFinancingPayment = async (id, remaining) => {
        const input = prompt(`დარჩენილია: $${remaining}. რა თანხა დაბრუნდა ახლა?`, '');
        if (input === null) return;
        const amount = Number(input);
        if (!amount || amount <= 0) return;
        // Fetch fresh state first so the repayment adds on top of the latest known amount
        const listRes = await fetch('/api/financings');
        const list = await listRes.json().catch(() => []);
        const current = (Array.isArray(list) ? list : []).find(r => r._id === id);
        if (!current) return alert('ჩანაწერი ვერ მოიძებნა.');
        const newRepaid = (current.amountRepaid || 0) + amount;
        const res = await fetch(`/api/financings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountRepaid: newRepaid })
        });
        if (!res.ok) { alert('გადახდის დამატება ვერ მოხერხდა.'); return; }
        loadFinancing();
    };

    window.deleteFinancing = async (id) => {
        if (!confirm('ჩანაწერის წაშლა? ეს მოქმედება შეუქცევადია.')) return;
        await fetch(`/api/financings/${id}`, { method: 'DELETE' });
        loadFinancing();
    };

    if (newFinancingBtn) newFinancingBtn.onclick = () => addFinancingForm?.classList.toggle('hidden');
    if (cancelFinancingBtn) cancelFinancingBtn.onclick = () => addFinancingForm?.classList.add('hidden');

    if (addFinancingForm) {
        addFinancingForm.onsubmit = async (e) => {
            e.preventDefault();
            const body = {
                dealerId: document.getElementById('finDealer').value,
                carInfo: document.getElementById('finCarInfo').value,
                vin: document.getElementById('finVin').value,
                financedAmount: document.getElementById('finAmount').value,
                amountRepaid: document.getElementById('finRepaid').value,
                fixedFee: document.getElementById('finFee').value,
                financedDate: document.getElementById('finDate').value
            };
            const res = await fetch('/api/financings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) { alert(payload?.error || 'ვერ შეინახა.'); return; }
            addFinancingForm.reset();
            document.getElementById('finFee').value = 200;
            addFinancingForm.classList.add('hidden');
            loadFinancing();
        };
    }

    // 5e. PROFIT SHARE
    async function loadProfitShares() {
        if (!profitShareTableBody) return;
        profitShareTableBody.innerHTML = '<tr><td colspan="8" class="table-empty">იტვირთება…</td></tr>';
        try {
            const res = await fetch('/api/profit-shares');
            const payload = await res.json().catch(() => null);
            if (!res.ok) throw new Error(payload?.error || 'Failed to load profit shares');
            const records = Array.isArray(payload) ? payload : [];

            const totalProfit = records.reduce((s, r) => s + (r.totalProfit || 0), 0);
            const companyTotal = records.reduce((s, r) => s + (r.companyAmount || 0), 0);
            const dealerTotal = records.reduce((s, r) => s + (r.dealerAmount || 0), 0);

            const elProfit = document.getElementById('psTotalProfit');
            const elCompany = document.getElementById('psCompanyTotal');
            const elDealer = document.getElementById('psDealerTotal');
            if (elProfit) elProfit.textContent = '$' + totalProfit.toLocaleString();
            if (elCompany) elCompany.textContent = '$' + companyTotal.toLocaleString();
            if (elDealer) elDealer.textContent = '$' + dealerTotal.toLocaleString();

            if (records.length === 0) {
                profitShareTableBody.innerHTML = '<tr><td colspan="8" class="table-empty">ჩანაწერები ჯერ არ არსებობს.</td></tr>';
                return;
            }

            profitShareTableBody.innerHTML = records.map(r => {
                const badgeClass = r.status === 'Paid' ? 'badge-paid' : 'badge-partial';
                const statusLabel = r.status === 'Paid' ? 'გადახდილი' : 'მოლოდინში';
                const adminCell = role === 'admin' ? `<td>${r.dealerId}</td>` : '';
                const actions = role === 'admin' ? `
                    ${r.status !== 'Paid' ? `<button class="btn-outline btn-sm" onclick="window.markProfitSharePaid('${r._id}')">გადახდილად მონიშვნა</button>` : ''}
                    <button class="icon-btn-sm danger" title="წაშლა" onclick="window.deleteProfitShare('${r._id}')">&times;</button>
                ` : '';
                return `<tr>
                    <td class="mono">${r.vin || '—'}</td>
                    <td>${r.carInfo || '—'}</td>
                    ${adminCell}
                    <td>$${(r.totalProfit || 0).toLocaleString()}</td>
                    <td>$${(r.companyAmount || 0).toLocaleString()} <span style="color:var(--muted);font-size:11px">(${r.companyPercent}%)</span></td>
                    <td>$${(r.dealerAmount || 0).toLocaleString()} <span style="color:var(--muted);font-size:11px">(${r.dealerPercent}%)</span></td>
                    <td><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
                    <td style="white-space:nowrap">${actions}</td>
                </tr>`;
            }).join('');
        } catch (err) {
            console.error('Failed to load profit shares.', err);
            profitShareTableBody.innerHTML = '<tr><td colspan="8" class="table-empty" style="color:var(--red)">ჩატვირთვა ვერ მოხერხდა.</td></tr>';
        }
    }

    window.markProfitSharePaid = async (id) => {
        const res = await fetch(`/api/profit-shares/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Paid' })
        });
        if (!res.ok) { alert('ვერ განახლდა.'); return; }
        loadProfitShares();
    };

    window.deleteProfitShare = async (id) => {
        if (!confirm('ჩანაწერის წაშლა? ეს მოქმედება შეუქცევადია.')) return;
        await fetch(`/api/profit-shares/${id}`, { method: 'DELETE' });
        loadProfitShares();
    };

    if (newProfitShareBtn) newProfitShareBtn.onclick = () => addProfitShareForm?.classList.toggle('hidden');
    if (cancelProfitShareBtn) cancelProfitShareBtn.onclick = () => addProfitShareForm?.classList.add('hidden');

    // Keep company/dealer percentages in sync (auto-complete to 100)
    const psCompanyPctInput = document.getElementById('psCompanyPct');
    const psDealerPctInput = document.getElementById('psDealerPct');
    if (psCompanyPctInput && psDealerPctInput) {
        psCompanyPctInput.addEventListener('input', () => {
            const v = Number(psCompanyPctInput.value) || 0;
            psDealerPctInput.value = Math.max(0, 100 - v);
        });
        psDealerPctInput.addEventListener('input', () => {
            const v = Number(psDealerPctInput.value) || 0;
            psCompanyPctInput.value = Math.max(0, 100 - v);
        });
    }

    if (addProfitShareForm) {
        addProfitShareForm.onsubmit = async (e) => {
            e.preventDefault();
            const body = {
                dealerId: document.getElementById('psDealer').value,
                carInfo: document.getElementById('psCarInfo').value,
                vin: document.getElementById('psVin').value,
                totalProfit: document.getElementById('psProfit').value,
                companyPercent: document.getElementById('psCompanyPct').value,
                dealerPercent: document.getElementById('psDealerPct').value,
                saleDate: document.getElementById('psDate').value
            };
            const res = await fetch('/api/profit-shares', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) { alert(payload?.error || 'ვერ შეინახა.'); return; }
            addProfitShareForm.reset();
            document.getElementById('psCompanyPct').value = 50;
            document.getElementById('psDealerPct').value = 50;
            addProfitShareForm.classList.add('hidden');
            loadProfitShares();
        };
    }

    // 6. MODAL MENU
    window.openCarMenu = (car) => {
        if (!modalBody) return;
        let galleryHtml = '';
        if (car.images && car.images.length > 0) {
            car.images.forEach((img, idx) => {
                const isLegacy = typeof img === 'string';
                const imgPath = isLegacy ? (img.startsWith('/uploads/') || img.startsWith('http') ? img : `/uploads/${img}`) : (img.url || '');
                const imgId = isLegacy ? img : (img.publicId || '');
                const deleteArg = imgId ? `'${imgId}'` : 'null';
                const removeBtn = role === 'admin'
                    ? `<button onclick="window.removeCarPhoto('${car._id}',${deleteArg},${idx})" title="წაშლა" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#BE3B30;color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;z-index:2;">&times;</button>`
                    : '';
                const brokenFallback = `this.onerror=null;this.style.objectFit='contain';this.style.padding='10px';this.style.background='#1a1a1a';this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%221.5%22><rect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/><circle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/><path d=%22M21 15l-5-5L5 21%22/></svg>';`;
                galleryHtml += `<div style="position:relative;display:inline-block;margin:5px;">
                    <img src="${imgPath}" onerror="${brokenFallback}" onclick="window.openLightbox('${imgPath.replace(/'/g, "\\'")}')" style="width:100px; height:100px; object-fit:cover; border-radius:4px; cursor:zoom-in;">
                    ${removeBtn}
                </div>`;
            });
        } else {
            galleryHtml = '<p style="color: #888;">No photos uploaded.</p>';
        }

        const normalizedDealerId = String(car.dealerId || '').trim().toLowerCase();
        const normalizedCurrentUser = String(currentUsername || '').trim().toLowerCase();
        const canEditCar = role === 'admin' || role === 'dealer' || normalizedDealerId === normalizedCurrentUser;
        const canUploadDocs = role === 'admin'; // backend also enforces admin-only for document uploads
        let adminTools = '';
        if (canEditCar) {
            let docsHtml = '<div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">';
            const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;
            if (car.documents && car.documents.length > 0) {
                car.documents.forEach((doc, idx) => {
                    const isLegacy = !doc.url;
                    const docPath = isLegacy
                        ? (doc.filename ? (doc.filename.startsWith('/uploads/') ? doc.filename : `/uploads/${doc.filename}`) : '')
                        : doc.url;
                    const docId = isLegacy ? (doc.filename || '') : (doc.publicId || '');
                    const deleteArg = docId ? `'${docId}'` : 'null';
                    const removeBtn = canUploadDocs
                        ? `<button onclick="window.deleteCarDoc('${car._id}',${deleteArg},${idx})" title="წაშლა" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#BE3B30;color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;z-index:2;">&times;</button>`
                        : '';
                    const displayLabel = doc.title || doc.originalName || 'დოკუმენტი';
                    const editArg = docId ? `'${docId}'` : 'null';
                    const editBtn = canUploadDocs
                        ? `<button onclick="window.editCarDocTitle('${car._id}',${editArg},${idx},'${displayLabel.replace(/'/g, "\\'")}')" title="დასახელების ცვლილება" style="position:absolute;bottom:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--gold,#C9A24A);color:#000;border:none;cursor:pointer;font-size:11px;line-height:1;z-index:2;">✎</button>`
                        : '';
                    if (IMAGE_EXT.test(doc.originalName || docPath)) {
                        docsHtml += `<div style="position:relative;text-align:center;">
                            <a href="${docPath}" target="_blank" title="${displayLabel}">
                                <img src="${docPath}" onerror="this.onerror=null;this.style.opacity='0.3';" style="width:90px;height:90px;object-fit:cover;border-radius:4px;border:1px solid #333;">
                            </a>
                            ${doc.title ? `<div style="font-size:11px;color:#aaa;margin-top:3px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${doc.title}</div>` : ''}
                            ${removeBtn}
                            ${editBtn}
                        </div>`;
                    } else {
                        docsHtml += `<div style="position:relative;display:flex;align-items:center;background:#111;border-radius:4px;padding:8px 28px 8px 10px;">
                            <a href="${docPath}" target="_blank" style="color:#ffcc00; text-decoration:none; font-size:13px;">📄 ${displayLabel}</a>
                            ${removeBtn}
                            ${editBtn}
                        </div>`;
                    }
                });
            } else {
                docsHtml += '<p style="color: #888; font-size: 14px;">No documents.</p>';
            }
            docsHtml += '</div>';

            const uploadControls = canUploadDocs ? `
                <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                    <input type="text" id="newDocTitle-${car._id}" placeholder="დოკუმენტის დასახელება (მაგ. ტაიტლი, ინვოისი, დაზღვევა)" style="background:#000; color:#fff; border:1px solid #333; padding:10px; border-radius:4px;">
                    <div style="display:flex; gap:10px;">
                        <input type="file" id="newDocFile-${car._id}" multiple style="background:#000; color:#fff; border:1px solid #333; padding:10px; flex:1;">
                        <button class="btn-primary" style="width:auto; padding:10px 20px;" onclick="window.uploadDoc('${car._id}')">Upload</button>
                    </div>
                </div>
            ` : '';

            adminTools = `
                <div class="modal-details-box" style="margin-top: 15px;">
                    <h3 style="color:#fff; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">Documents</h3>
                    ${docsHtml}
                    ${uploadControls}
                </div>
            `;
        }

        const editTools = role === 'admin' ? `
            <div class="modal-details-box" style="margin-top: 15px;">
                <button class="btn-primary" style="background: #333; color: #fff;" onclick="window.showEditForm('${car._id}')">Edit Car Details</button>
            </div>
        ` : '';

        const totalCost = (car.auctionPrice || 0) + (car.transportPrice || 0);
        const leftToPay = totalCost - (car.amountPaid || 0);

        modalBody.innerHTML = `
            <h2 style="color: #ffcc00; font-size: 24px; margin-bottom: 20px;">${car.makeModel}</h2>
            
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                <div class="modal-details-box">
                    <h3 style="color:#fff; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">Financials</h3>
                    <p style="color:#ccc; margin-bottom:5px;">Auction: $${(car.auctionPrice || 0).toLocaleString()}</p>
                    <p style="color:#ccc; margin-bottom:5px;">Transport: $${(car.transportPrice || 0).toLocaleString()}</p>
                    <p style="color:#ccc; margin-bottom:5px;">Paid: $${(car.amountPaid || 0).toLocaleString()}</p>
                    <p style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #333;">Balance: <strong style="color: ${leftToPay > 0 ? '#ff4444' : '#00C851'};">$${leftToPay.toLocaleString()}</strong></p>
                </div>

                <div class="modal-details-box">
                    <h3 style="color:#fff; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">Logistics & Info</h3>
                    <p style="color:#ccc; margin-bottom:5px;">Date: ${car.purchaseDate || 'N/A'}</p>
                    <p style="color:#ccc; margin-bottom:5px;">Auction: ${car.auctionName || 'N/A'}</p>
                    <p style="color:#ccc; margin-bottom:5px;">Location: ${car.buyLocation || 'N/A'}</p>
                    <p style="color:#ccc; margin-bottom:5px;">VIN: ${car.vin}</p>
                    <p style="color:#ccc; margin-bottom:5px;">Lot: ${car.lotNumber || 'N/A'}</p>
                    <p style="color:#ccc; margin-bottom:5px;">Container: ${car.containerNumber || 'N/A'}</p>
                </div>

                <div class="modal-details-box">
                    <h3 style="color:#fff; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">Recipient Details</h3>
                    <p style="color:#ccc; margin-bottom:5px;">Name: ${car.recipientFirstName || ''} ${car.recipientLastName || ''}</p>
                    <p style="color:#ccc; margin-bottom:5px;">ID: ${car.recipientId || 'N/A'}</p>
                    <p style="color:#ccc; margin-bottom:5px;">Phone: ${car.recipientPhone || 'N/A'}</p>
                </div>
            </div>

            <div class="modal-details-box" style="margin-top: 15px;">
                <p style="display: flex; align-items: center; justify-content:space-between;">
                    <strong style="color:#fff;">Pipeline Status:</strong>
                    ${role === 'admin' ? `
                    <select onchange="window.updateCarStatus('${car._id}', this.value)" style="padding:10px; background:#000; color:#fff; border:1px solid #333; border-radius:4px;">
                        <option value="Purchased" ${car.status === 'Purchased' ? 'selected' : ''}>Purchased</option>
                        <option value="In Transit" ${car.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
                        <option value="At Customs" ${car.status === 'At Customs' ? 'selected' : ''}>At Customs</option>
                        <option value="Arrived" ${car.status === 'Arrived' ? 'selected' : ''}>Arrived</option>
                        <option value="Sold" ${car.status === 'Sold' ? 'selected' : ''}>Sold</option>
                    </select>
                    ` : `<span class="car-status-badge">${car.status || 'Purchased'}</span>`}
                </p>
            </div>
            
            ${adminTools}
            ${editTools}

            <h3 style="margin-top: 20px; color:#fff;">Gallery</h3>
            <div class="modal-gallery" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:10px;">${galleryHtml}</div>
            ${role === 'admin' ? `
            <div style="display:flex; gap:10px; margin-top:14px;">
                <input type="file" id="newPhotoFile-${car._id}" multiple accept="image/*" style="background:#000; color:#fff; border:1px solid #333; padding:10px; flex:1;">
                <button class="btn-primary" style="width:auto; padding:10px 20px;" onclick="window.uploadCarPhotos('${car._id}')">Upload</button>
            </div>
            ` : ''}
        `;
        carModal.classList.remove('hidden');
    };

    window.uploadCarPhotos = async (carId) => {
        const input = document.getElementById(`newPhotoFile-${carId}`);
        if (!input || !input.files || input.files.length === 0) { alert('აირჩიე მინიმუმ ერთი ფოტო.'); return; }
        const formData = new FormData();
        for (let i = 0; i < input.files.length; i++) formData.append('photos', input.files[i]);
        try {
            const res = await fetch(`/api/cars/${carId}/photos`, { method: 'PATCH', body: formData });
            const payload = await res.json().catch(() => null);
            if (!res.ok) { alert(payload?.error || 'ფოტოების ატვირთვა ვერ მოხერხდა.'); return; }
            await loadCars();
            const updated = window.maiCars.find(c => c._id === carId);
            if (updated) window.openCarMenu(updated);
        } catch (err) {
            console.error('Photo upload failed.', err);
            alert('ფოტოების ატვირთვა ვერ მოხერხდა.');
        }
    };

    window.removeCarPhoto = async (carId, publicId, index) => {
        if (!confirm('ფოტოს წაშლა?')) return;
        try {
            const res = await fetch(`/api/cars/${carId}/photos/remove`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicId, index })
            });
            if (!res.ok) { alert('ფოტოს წაშლა ვერ მოხერხდა.'); return; }
            await loadCars();
            const updated = window.maiCars.find(c => c._id === carId);
            if (updated) window.openCarMenu(updated);
        } catch (err) {
            console.error('Photo delete failed.', err);
            alert('ფოტოს წაშლა ვერ მოხერხდა.');
        }
    };

    window.deleteCarDoc = async (carId, publicId, index) => {
        if (!confirm('დოკუმენტის წაშლა?')) return;
        try {
            const res = await fetch(`/api/cars/${carId}/documents/remove`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicId, index })
            });
            if (!res.ok) { alert('დოკუმენტის წაშლა ვერ მოხერხდა.'); return; }
            await loadCars();
            const updated = window.maiCars.find(c => c._id === carId);
            if (updated) window.openCarMenu(updated);
        } catch (err) {
            console.error('Document delete failed.', err);
            alert('დოკუმენტის წაშლა ვერ მოხერხდა.');
        }
    };

    window.editCarDocTitle = async (carId, publicId, index, currentLabel) => {
        const newTitle = prompt('დოკუმენტის დასახელება:', currentLabel || '');
        if (newTitle === null) return; // cancelled
        try {
            const res = await fetch(`/api/cars/${carId}/documents/title`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicId, index, title: newTitle })
            });
            if (!res.ok) { alert('დასახელების შენახვა ვერ მოხერხდა.'); return; }
            await loadCars();
            const updated = window.maiCars.find(c => c._id === carId);
            if (updated) window.openCarMenu(updated);
        } catch (err) {
            console.error('Document title update failed.', err);
            alert('დასახელების შენახვა ვერ მოხერხდა.');
        }
    };

    // 7. FORM SUBMISSIONS
    if (addCarForm) {
        addCarForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append('makeModel', document.getElementById('carMake').value);
            formData.append('auctionPrice', document.getElementById('auctionPrice').value);
            formData.append('transportPrice', document.getElementById('transportPrice').value);
            formData.append('amountPaid', document.getElementById('amountPaid').value);
            formData.append('recipientFirstName', document.getElementById('recFirstName').value);
            formData.append('recipientLastName', document.getElementById('recLastName').value);
            formData.append('recipientId', document.getElementById('recId').value);
            formData.append('recipientPhone', document.getElementById('recPhone').value);
            formData.append('purchaseDate', document.getElementById('carPurchaseDate').value);
            formData.append('auctionName', document.getElementById('carAuctionName').value);
            formData.append('buyLocation', document.getElementById('carBuyLocation').value);
            formData.append('vin', document.getElementById('carVin').value);
            formData.append('lotNumber', document.getElementById('carLotNumber').value);
            const dealerValue = role === 'admin' ? document.getElementById('carDealer').value : currentUsername;
            formData.append('dealerId', dealerValue);
            formData.append('containerNumber', document.getElementById('carContainerNumber').value);
            formData.append('containerCode', document.getElementById('carContainerCode').value);

            const photos = document.getElementById('carPhotos').files;
            for(let i=0; i<photos.length; i++) { formData.append('photos', photos[i]); }

            const res = await fetch('/api/cars', { method: 'POST', body: formData });
            const payload = await res.json().catch(() => null);
            if (!res.ok) {
                alert(payload?.error || 'Failed to add car.');
                return;
            }
            addCarForm.reset();
            if (role !== 'admin' && carDealerInput) carDealerInput.value = currentUsername;
            showSection('garage');
        };
    }

    if (addUserForm) {
        addUserForm.onsubmit = async (e) => {
            e.preventDefault();
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('newUsername').value,
                    password: document.getElementById('newPassword').value,
                    role: document.getElementById('newRole').value
                })
            });
            if (res.ok) { alert("User Created!"); addUserForm.reset(); }
        };
    }

    // 8. LIVE BALANCE CALC
    const aucInput = document.getElementById('auctionPrice');
    const transInput = document.getElementById('transportPrice');
    const paidInput = document.getElementById('amountPaid');
    const leftDisplay = document.getElementById('leftToPayDisplay');

    function calcLiveBalance() {
        if(aucInput && transInput && paidInput && leftDisplay) {
            const total = (parseFloat(aucInput.value) || 0) + (parseFloat(transInput.value) || 0);
            const left = total - (parseFloat(paidInput.value) || 0);
            leftDisplay.value = '$' + left.toLocaleString();
            leftDisplay.style.color = left > 0 ? '#ff4444' : '#00C851';
        }
    }
    [aucInput, transInput, paidInput].forEach(el => el?.addEventListener('input', calcLiveBalance));

    // 9. GENERAL LISTENERS
    if (closeModal) closeModal.onclick = () => carModal?.classList.add('hidden');

    // Image lightbox (click a thumbnail to view full-size + download)
    const imageLightbox = document.getElementById('imageLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxDownload = document.getElementById('lightboxDownload');
    const closeLightbox = document.getElementById('closeLightbox');

    window.openLightbox = (url) => {
        if (!imageLightbox || !lightboxImg) return;
        lightboxImg.src = url;
        if (lightboxDownload) {
            // Cloudinary: inserting fl_attachment forces a real download instead of opening in-browser
            const downloadUrl = url.includes('res.cloudinary.com') && url.includes('/upload/')
                ? url.replace('/upload/', '/upload/fl_attachment/')
                : url;
            lightboxDownload.href = downloadUrl;
        }
        imageLightbox.classList.remove('hidden');
    };
    if (closeLightbox) closeLightbox.onclick = () => imageLightbox?.classList.add('hidden');
    if (imageLightbox) imageLightbox.addEventListener('click', (e) => {
        if (e.target === imageLightbox) imageLightbox.classList.add('hidden');
    });

    const logoutBtn = document.querySelector('.logout');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => { 
            e.preventDefault();
            sessionStorage.removeItem('mai_user'); 
            window.location.href = 'login.html'; 
        };
    }

    // INITIATE
    loadCars();
});

