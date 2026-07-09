document.addEventListener('DOMContentLoaded', function() {
    // 1. SESSION GUARD
    const sessionData = sessionStorage.getItem('mai_user');
    if (!sessionData) { window.location.replace('login.html'); return; }
    
    const userData = JSON.parse(sessionData);
    const role = String(userData.role || '').toLowerCase();
    const currentUsername = userData.username;

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
        invoices: document.getElementById('tabInvoices')
    };
    const views = { 
        garage: document.getElementById('viewGarage'), 
        addCar: document.getElementById('viewAddCar'), 
        users: document.getElementById('viewUsers'),
        stats: document.getElementById('viewStats'),
        invoices: document.getElementById('viewInvoices')
    };

    // Invoices DOM
    const invoicesTableBody = document.getElementById('invoicesTableBody');
    const addInvoiceForm = document.getElementById('addInvoiceForm');
    const newInvoiceBtn = document.getElementById('newInvoiceBtn');
    const cancelInvoiceBtn = document.getElementById('cancelInvoiceBtn');

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
    }

    if (tabs.garage) tabs.garage.onclick = (e) => { e.preventDefault(); showSection('garage'); };
    if (tabs.addCar) tabs.addCar.onclick = (e) => { e.preventDefault(); showSection('addCar'); };
    if (tabs.users) tabs.users.onclick = (e) => { e.preventDefault(); showSection('users'); };
    if (tabs.stats) tabs.stats.onclick = (e) => { e.preventDefault(); showSection('stats'); };
    if (tabs.invoices) tabs.invoices.onclick = (e) => { e.preventDefault(); showSection('invoices'); };

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
        if (!fileInput || !fileInput.files.length) return alert("Select a file.");
        const formData = new FormData();
        for(let i=0; i<fileInput.files.length; i++) { formData.append('docs', fileInput.files[i]); }
        await fetch(`/api/cars/${carId}/documents`, { method: 'PATCH', body: formData });
        if (carModal) carModal.classList.add('hidden');
        loadCars();
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
                const previewImg = firstImg.startsWith('/uploads/') ? firstImg : (firstImg ? `/uploads/${firstImg}` : '');

                const totalCost = (car.auctionPrice || 0) + (car.transportPrice || 0);
                const leftToPay = totalCost - (car.amountPaid || 0);
                const balanceColor = leftToPay > 0 ? '#ff4444' : '#00C851'; 
                
                card.innerHTML = `
                    <div class="car-image">
                        ${previewImg ? `<img src="${previewImg}">` : '<div style="padding:20px; text-align:center; color:#555;">No Photo</div>'}
                        ${role === 'admin' ? `<button style="position:absolute; top:10px; right:40px; background:#111; color:#fff; border:none; padding:5px 10px; cursor:pointer; z-index:10;" onclick="event.stopPropagation(); window.featureCar('${car._id}')">&#9733;</button>` : ''}
                        ${(role === 'admin' || car.dealerId === currentUsername) ? `<button style="position:absolute; top:10px; right:10px; background:#ff4444; color:#fff; border:none; padding:5px 10px; cursor:pointer; z-index:10;" onclick="event.stopPropagation(); window.deleteCar('${car._id}')">&times;</button>` : ''}
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

    // 6. MODAL MENU
    window.openCarMenu = (car) => {
        if (!modalBody) return;
        let galleryHtml = '';
        if (car.images && car.images.length > 0) {
            car.images.forEach(img => { 
                const imgPath = img.startsWith('/uploads/') ? img : `/uploads/${img}`;
                galleryHtml += `<img src="${imgPath}" style="width:100px; height:100px; object-fit:cover; margin:5px; border-radius:4px;">`; 
            });
        } else {
            galleryHtml = '<p style="color: #888;">No photos uploaded.</p>';
        }

        const normalizedDealerId = String(car.dealerId || '').trim().toLowerCase();
        const normalizedCurrentUser = String(currentUsername || '').trim().toLowerCase();
        const canEditCar = role === 'admin' || role === 'dealer' || normalizedDealerId === normalizedCurrentUser;
        let adminTools = '';
        if (canEditCar) {
            let docsHtml = '<ul style="list-style:none; padding:0; margin-bottom:10px;">';
            if (car.documents && car.documents.length > 0) {
                car.documents.forEach(doc => { 
                    const docPath = doc.filename.startsWith('/uploads/') ? doc.filename : `/uploads/${doc.filename}`;
                    docsHtml += `<li style="margin-bottom:5px;"><a href="${docPath}" target="_blank" style="color:#ffcc00; text-decoration:none;">📄 ${doc.originalName}</a></li>`; 
                });
            } else {
                docsHtml += '<li style="color: #888; font-size: 14px;">No documents.</li>';
            }
            docsHtml += '</ul>';

            adminTools = `
                <div class="modal-details-box" style="margin-top: 15px;">
                    <h3 style="color:#fff; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">Documents</h3>
                    ${docsHtml}
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <input type="file" id="newDocFile-${car._id}" multiple style="background:#000; color:#fff; border:1px solid #333; padding:10px; flex:1;">
                        <button class="btn-primary" style="width:auto; padding:10px 20px;" onclick="window.uploadDoc('${car._id}')">Upload</button>
                    </div>

                </div>
            `;
        }

        const editTools = canEditCar ? `
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
                    <select onchange="window.updateCarStatus('${car._id}', this.value)" style="padding:10px; background:#000; color:#fff; border:1px solid #333; border-radius:4px;">
                        <option value="Purchased" ${car.status === 'Purchased' ? 'selected' : ''}>Purchased</option>
                        <option value="In Transit" ${car.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
                        <option value="At Customs" ${car.status === 'At Customs' ? 'selected' : ''}>At Customs</option>
                        <option value="Arrived" ${car.status === 'Arrived' ? 'selected' : ''}>Arrived</option>
                        <option value="Sold" ${car.status === 'Sold' ? 'selected' : ''}>Sold</option>
                    </select>
                </p>
            </div>
            
            ${adminTools}
            ${editTools}

            <h3 style="margin-top: 20px; color:#fff;">Gallery</h3>
            <div class="modal-gallery" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:10px;">${galleryHtml}</div>
        `;
        carModal.classList.remove('hidden');
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

