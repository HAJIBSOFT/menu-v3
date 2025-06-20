// script.js

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzEiCjRzhvdrhxWUd48k0A-LwpjNo_Q1ZreGrdYIwC-d0DOoLr8nnxon0K2q6hz2f0Isw/exec'; // <--- عدّل هذا!!!

// --- الحالة العامة للتطبيق ---
let currentUser = null;
let menuData = [];
let clientCart = [];
let staffWaiterCart = [];
let currentTableIdFromQR = null;
let staffKitchenInterval = null;
const VAT_RATE = 0.15;
let currentClientMenuFilter = 'all';
let currentClientSearchTerm = '';
let currentStaffWaiterSearchTerm = '';
// let selectedImageFileStaff = null; // <-- تم تعليقه لأن رفع الملفات معطل حاليًا

// --- دوال مساعدة عامة ---
async function callGoogleScriptAPI(action, params = {}) {
    const isStaffPage = window.location.pathname.includes('login.html') || window.location.pathname.endsWith('/login');
    showLoading(true, isStaffPage ? 'staff' : 'main');
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST', mode: 'cors', redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8', },
            body: JSON.stringify({ action: action, params: params })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API Call Error (${response.status}) for action ${action}:`, errorText);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        const result = await response.json();
        showLoading(false, isStaffPage ? 'staff' : 'main');
        if (result && result.isSubscriptionError && result.success === false) {
            handleSubscriptionError(result.subscriptionDetails, isStaffPage);
            return result;
        }
        return result;
    } catch (error) {
        showLoading(false, isStaffPage ? 'staff' : 'main');
        console.error('Network/Fetch Error calling API:', action, error);
        showToast(`فشل الاتصال بالخادم: ${error.message}. قد يكون هناك مشكلة في الشبكة أو في رابط الـ API.`, "error", 10000);
        return { success: false, message: `فشل الاتصال بالخادم: ${error.message}.` };
    }
}

function showLoading(isLoading, context = 'main') {
    const spinnerId = context === 'staff' ? 'loading-spinner-staff' : 'loading-spinner-main';
    const spinner = document.getElementById(spinnerId);
    if (spinner) spinner.style.display = isLoading ? 'flex' : 'none';
}

function showToast(message, type = 'info', duration = 3000) {
    const tc = document.getElementById('toast-container');
    if (!tc) { console.error("Toast container not found!"); return; }
    const t = document.createElement('div'); t.className = `toast ${type}`;
    let i = 'fas fa-info-circle'; if (type === 'success') i = 'fas fa-check-circle'; else if (type === 'error') i = 'fas fa-exclamation-circle';
    t.innerHTML = `<i class="${i}"></i><span>${message}</span>`; tc.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => { if (t.parentNode === tc) tc.removeChild(t); }, 300); }, duration);
}

function parseUrlParams() {
    console.log("Parsing URL params...");
    const p = new URLSearchParams(window.location.search); const t = p.get('table');
    const orderTypeSelectionDiv = document.getElementById('order-type-selection-client');
    const customerIdentifierInput = document.getElementById('customer-identifier-client-panel');
    const deliveryInfoDiv = document.getElementById('delivery-info-client');

    if (t) {
        currentTableIdFromQR = t; console.log("Table ID from QR:", t);
        if (customerIdentifierInput) { customerIdentifierInput.value = `طاولة ${decodeURIComponent(t)}`; customerIdentifierInput.style.display = 'block';}
        if (orderTypeSelectionDiv) orderTypeSelectionDiv.style.display = 'none';
        if (deliveryInfoDiv) deliveryInfoDiv.style.display = 'none';
    } else {
        console.log("No table ID in URL."); currentTableIdFromQR = null;
        if (orderTypeSelectionDiv) orderTypeSelectionDiv.style.display = 'block';
        // استدعاء handleOrderTypeChangeClient يتم الآن من initializeClientMenuPage بعد التأكد أننا في الصفحة الصحيحة
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded. Path:", window.location.pathname);
    const ac = document.getElementById('app-container') || document.getElementById('app-container-login');
    if (!ac) { console.error("App container not found!"); return; }
    parseUrlParams();
    if (window.location.pathname.includes('login.html') || window.location.pathname.endsWith('/login')) initializeStaffLoginPage();
    else checkClientSubscriptionAndInitialize();

    const currentYearSpan = document.getElementById('current-year') || document.getElementById('current-year-staff');
    if (currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();
});

function handleSubscriptionError(subscriptionDetails, isStaffPage) {
    const overlayId = isStaffPage ? 'subscription-expired-overlay-staff' : 'subscription-expired-overlay-client';
    const mainContentId = isStaffPage ? 'main-content-staff' : 'main-content-client';
    const messageId = isStaffPage ? 'subscription-expired-message-staff' : 'subscription-expired-message-client';
    const proceedLinkId = 'proceed-as-manager-link-staff';

    const overlay = document.getElementById(overlayId);
    const mainContent = document.getElementById(mainContentId);
    const messageElement = document.getElementById(messageId);
    const proceedLink = document.getElementById(proceedLinkId);

    if (overlay && mainContent && messageElement) {
        overlay.style.display = 'flex';
        mainContent.style.display = 'none';
        messageElement.textContent = subscriptionDetails?.message || "الاشتراك غير سارٍ أو انتهى.";
        if (isStaffPage && proceedLink) {
            const userFromSession = sessionStorage.getItem('currentUser');
            let tempUser = null;
            if (userFromSession) { try { tempUser = JSON.parse(userFromSession); } catch(e) { console.error("Error parsing session for proceed link:", e);} }
            const effectiveUser = currentUser || tempUser;
            if (effectiveUser?.role === 'manager') {
                proceedLink.style.display = 'block';
                proceedLink.onclick = (e) => {
                    e.preventDefault();
                    overlay.style.display = 'none'; mainContent.style.display = 'block';
                    if(effectiveUser.username){ navigateToStaffRolePage('manager', effectiveUser.username); showStaffSubPage('manager-subscription-staff', 'manager-view-staff'); loadStaffSubscriptionDetails(); }
                    else { displayStaffLoginForm(); }
                };
            } else { proceedLink.style.display = 'none'; }
        }
    } else { console.error("Subscription overlay elements not found for", isStaffPage ? "staff" : "client"); showToast(subscriptionDetails?.message || "الاشتراك غير سارٍ.", "error", 10000); }
}

// ========================== STAFF (login.html) LOGIC ==========================
function initializeStaffLoginPage() {
    console.log("Init Staff Page..."); showLoading(false, 'staff');
    try {
        const su = sessionStorage.getItem('currentUser');
        if (su) { currentUser = JSON.parse(su);
            if (currentUser?.role && currentUser?.username) { console.log("User in session (staff):", currentUser); checkStaffSubscriptionAndNavigate(currentUser.role, currentUser.username); }
            else { currentUser = null; displayStaffLoginForm(); }
        } else displayStaffLoginForm();
    } catch (e) { console.error("Session error (staff):", e); sessionStorage.removeItem('currentUser'); currentUser = null; displayStaffLoginForm(); }
    document.getElementById('login-button-staff')?.addEventListener('click', handleStaffLoginAttempt);
    document.getElementById('logout-button-staff')?.addEventListener('click', handleStaffLogout);
    document.getElementById('submit-waiter-order-staff')?.addEventListener('click', submitStaffWaiterOrder);
    document.getElementById('show-add-item-form-button-staff')?.addEventListener('click', () => toggleAddEditItemFormStaff(false));
    document.getElementById('save-item-button-staff-form')?.addEventListener('click', handleSaveStaffMenuItem);
    document.getElementById('cancel-edit-item-button-staff-form')?.addEventListener('click', cancelEditStaffMenuItem);
    // document.getElementById('item-image-file-staff-form')?.addEventListener('change', handleStaffImageFileSelect); // <-- معلق
    document.getElementById('generate-qr-button-staff')?.addEventListener('click', generateStaffTableQR);
    document.getElementById('load-sales-report-button-staff')?.addEventListener('click', loadStaffSalesReport);
    document.getElementById('create-user-button-staff')?.addEventListener('click', createNewStaffSystemUser);
    document.getElementById('search-menu-waiter-staff')?.addEventListener('input', (event) => { currentStaffWaiterSearchTerm = event.target.value.toLowerCase(); renderStaffWaiterMenu(menuData); });
    document.querySelectorAll('#waiter-view-staff .dashboard-nav .nav-button').forEach(b => b.addEventListener('click', () => showStaffSubPage(b.dataset.target, 'waiter-view-staff')));
    document.querySelectorAll('#manager-view-staff .dashboard-nav .nav-button').forEach(b => {
        b.addEventListener('click', () => {
            const targetSubPage = b.dataset.target;
            showStaffSubPage(targetSubPage, 'manager-view-staff');
        });
    });
}

function displayStaffLoginForm() {
    console.log("Displaying staff login form.");
    document.querySelectorAll('#app-container-login .page').forEach(el => el.classList.remove('active'));
    document.getElementById('login-form-view')?.classList.add('active');
    const lo = document.getElementById('logout-button-staff'); if(lo)lo.style.display = 'none';
    const at = document.getElementById('app-title-staff'); if(at)at.innerHTML = '<i class="fas fa-lock"></i> تسجيل دخول الموظفين';
    const uf = document.getElementById('username-staff'); if(uf){uf.value=''; uf.focus();}
    const pf = document.getElementById('password-staff'); if(pf)pf.value='';
    const le = document.getElementById('login-error-staff'); if(le)le.textContent='';
    const mainContentStaff = document.getElementById('main-content-staff'); if(mainContentStaff) mainContentStaff.style.display = 'block';
    const overlayStaff = document.getElementById('subscription-expired-overlay-staff'); if(overlayStaff) overlayStaff.style.display = 'none';
}

async function handleStaffLoginAttempt() {
    const uf=document.getElementById('username-staff'), pf=document.getElementById('password-staff'), le=document.getElementById('login-error-staff');
    if(!uf||!pf||!le){showToast("خطأ بالنموذج.","error");return;}
    const u=uf.value, p=pf.value; le.textContent=''; if(!u||!p){showToast("ادخل البيانات.","error");return;}
    const response = await callGoogleScriptAPI('loginUser', {username:u, password:p});
    if(response.success&&response.role&&response.username){
        currentUser={username:response.username,role:response.role,userId:response.userId};
        try{
            sessionStorage.setItem('currentUser',JSON.stringify(currentUser));
            console.log("Staff login ok:",currentUser);
            if (response.subscriptionStatus) {
                sessionStorage.setItem('lastSubscriptionCheck', JSON.stringify(response.subscriptionStatus));
                if (response.subscriptionStatus.isActive) {
                    navigateToStaffRolePage(currentUser.role,currentUser.username);
                } else {
                    handleSubscriptionError(response.subscriptionStatus, true);
                    if (currentUser.role !== 'manager') { sessionStorage.removeItem('currentUser'); currentUser = null; }
                }
            } else { showToast("لم يتم استقبال حالة الاشتراك. حاول مرة أخرى.", "error"); displayStaffLoginForm(); }
        }
        catch(e){console.error("Session save/nav error:",e);showToast("خطأ حفظ/توجيه الجلسة: " + e.message,"error");}
        uf.value='';pf.value='';
    } else { const m=response.message||"بيانات خطأ.";le.textContent=m;showToast(m,"error");}
}

async function checkStaffSubscriptionAndNavigate(role, username) {
    console.log("Checking staff subscription for existing session. Role:", role);
    const subscriptionResponse = await callGoogleScriptAPI('checkSubscriptionStatus', {});
    sessionStorage.setItem('lastSubscriptionCheck', JSON.stringify(subscriptionResponse));
    const mainContentStaff = document.getElementById('main-content-staff');
    const overlayStaff = document.getElementById('subscription-expired-overlay-staff');

    if (overlayStaff && mainContentStaff) {
        if (subscriptionResponse && subscriptionResponse.isActive) {
            overlayStaff.style.display = 'none';
            mainContentStaff.style.display = 'block';
            navigateToStaffRolePage(role, username);
        } else if (subscriptionResponse) {
            handleSubscriptionError(subscriptionResponse, true);
            if (role !== 'manager') { mainContentStaff.style.display = 'none'; console.log("Non-manager with expired sub - access blocked."); }
        } else { showToast("فشل التحقق من الاشتراك.", "error"); displayStaffLoginForm(); }
    } else { console.error("Staff subscription overlay/content elements not found!"); navigateToStaffRolePage(role, username); }
}

function navigateToStaffRolePage(role, username) {
    console.log("Navigating staff to:",role,"User:",username);
    document.querySelectorAll('#app-container-login .page').forEach(el=>el.classList.remove('active'));
    const lo=document.getElementById('logout-button-staff'); if(lo)lo.style.display='block';
    const at=document.getElementById('app-title-staff'); let tpeId=null; let userSpanElement = null;

    if(role==='manager'){
        tpeId='manager-view-staff'; userSpanElement = document.getElementById('manager-username-staff');
        if(at) { const nt = '<i class="fas fa-user-shield"></i> واجهة المدير'; at.innerHTML = nt; }
        const subDetailsString = sessionStorage.getItem('lastSubscriptionCheck');
        let subDetails = null;
        if(subDetailsString) { try { subDetails = JSON.parse(subDetailsString); } catch(e){ console.error("Error parsing subDetails from session", e);}}
        if (subDetails && !subDetails.isActive) { showStaffSubPage('manager-subscription-staff', 'manager-view-staff'); }
        else { showStaffSubPage('manager-manage-items-staff','manager-view-staff'); }
        if(!menuData || !menuData.length)loadMenuDataForStaff(true);
    }
    else if(role==='waiter'){
        tpeId='waiter-view-staff'; userSpanElement = document.getElementById('waiter-username-staff');
        if(at) { const nt = '<i class="fas fa-concierge-bell"></i> واجهة النادل'; at.innerHTML = nt; }
        showStaffSubPage('waiter-new-order-staff','waiter-view-staff');
        if(!menuData || !menuData.length)loadMenuDataForStaff();
        else renderStaffWaiterMenu(menuData);
    }
    else if(role==='kitchen'){
        tpeId='kitchen-view-staff'; userSpanElement = document.getElementById('kitchen-username-staff');
        if(at) { const nt = '<i class="fas fa-blender-phone"></i> واجهة المطبخ'; at.innerHTML = nt; }
        loadStaffKitchenOrders();
        if(staffKitchenInterval)clearInterval(staffKitchenInterval);staffKitchenInterval=setInterval(loadStaffKitchenOrders,30000);
    }
    else {console.warn("Unknown role:",role);displayStaffLoginForm();return;}

    if(userSpanElement) userSpanElement.textContent = username; else console.warn(`Username span for ${role} not found.`);
    const tpe=document.getElementById(tpeId); if(tpe){tpe.classList.add('active');console.log("Page",tpe.id,"active.");} else {console.error("Target page",tpeId,"not found!");displayStaffLoginForm();}
}

function handleStaffLogout() { console.log("Logging out from staff page."); currentUser = null; try { sessionStorage.removeItem('currentUser');sessionStorage.removeItem('lastSubscriptionCheck'); } catch (e) { console.error("Session remove error:", e); } if (staffKitchenInterval) { clearInterval(staffKitchenInterval); staffKitchenInterval = null; } displayStaffLoginForm(); showToast("تم تسجيل الخروج.", "success"); }
async function loadMenuDataForStaff(forEditing = false) { console.log("Loading menu data for staff. For editing:", forEditing); const r = await callGoogleScriptAPI('getMenuItems', { forManager: forEditing }); if (r.success) { menuData = r.data; if (forEditing && document.getElementById('manager-manage-items-staff')?.classList.contains('active-sub')) { renderStaffMenuItemsForEditing(menuData); } else if (document.getElementById('waiter-new-order-staff')?.classList.contains('active-sub')) { renderStaffWaiterMenu(menuData); } } else { showToast("فشل تحميل قائمة الطعام للموظفين.", "error"); const wmc = document.getElementById('waiter-menu-items-container-staff'); if (wmc) wmc.innerHTML = `<p class="loading-text" style="color:red;">${r.message||'فشل'}</p>`; const mmc = document.getElementById('menu-items-list-manager-staff'); if (mmc) mmc.innerHTML = `<p class="loading-text" style="color:red;">${r.message||'فشل'}</p>`; } }
function showStaffSubPage(subPageId, parentPageId) { console.log(`Show staff subpage: ${subPageId} in ${parentPageId}`); const pv = document.getElementById(parentPageId); if (!pv) { console.error(`Parent ${parentPageId} not found!`); return; } pv.querySelectorAll('.dashboard-sub-page').forEach(p => p.classList.remove('active-sub')); const tsp = document.getElementById(subPageId); if (tsp) tsp.classList.add('active-sub'); else console.error(`Subpage ${subPageId} not found!`); pv.querySelectorAll('.dashboard-nav .nav-button').forEach(b => b.classList.remove('active')); const tb = pv.querySelector(`.dashboard-nav .nav-button[data-target='${subPageId}']`); if (tb) tb.classList.add('active'); if (subPageId === 'waiter-new-order-staff') { if (menuData?.length) renderStaffWaiterMenu(menuData); else loadMenuDataForStaff(); } else if (subPageId === 'waiter-view-orders-staff') loadStaffWaiterOrders(); else if (subPageId === 'manager-manage-items-staff') loadStaffMenuItemsForEditing(); else if (subPageId === 'manager-subscription-staff') loadStaffSubscriptionDetails(); }
function toggleAddEditItemFormStaff(isEditMode = false, item = null) { const fc=document.getElementById('add-edit-item-form-container-staff'),ft=document.getElementById('add-edit-item-form-title-staff'),sb=document.getElementById('save-item-button-staff-form'),cb=document.getElementById('cancel-edit-item-button-staff-form'),sf=document.getElementById('show-add-item-form-button-staff'),ip=document.getElementById('item-image-preview-staff-form'),ifi=document.getElementById('item-image-file-staff-form'),eiis=document.getElementById('edit-item-id-staff'); if(!fc||!ft||!sb||!cb||!sf||!eiis) { console.error("One or more add/edit item form elements are missing."); return; } if(fc.style.display==='none'||isEditMode){fc.style.display='block';sf.textContent='إخفاء النموذج';if(isEditMode&&item){ft.textContent='تعديل الصنف';eiis.value=item.id;document.getElementById('item-name-staff-form').value=item.name;document.getElementById('item-description-staff-form').value=item.description;document.getElementById('item-price-staff-form').value=item.price;document.getElementById('item-category-staff-form').value=item.category;document.getElementById('item-image-url-staff-form').value=item.imageUrl||'';document.getElementById('item-available-staff-form').checked=item.isAvailable!==undefined?item.isAvailable:true; if(ip) { if(item.imageUrl){ip.src=item.imageUrl;ip.style.display='block';}else ip.style.display='none'; } if(ifi) ifi.style.display = 'block'; /* selectedImageFileStaff=null; */ sb.textContent='حفظ التعديلات';cb.style.display='inline-block';}else{ft.textContent='إضافة صنف';eiis.value='';['item-name-staff-form','item-description-staff-form','item-price-staff-form','item-category-staff-form','item-image-url-staff-form'].forEach(id=>document.getElementById(id).value='');document.getElementById('item-available-staff-form').checked=true; if(ip) ip.style.display='none'; if(ifi) {ifi.value=''; /* ifi.style.display = 'block'; */} /* selectedImageFileStaff=null; */ sb.textContent='إضافة الصنف';cb.style.display='none';}}else{fc.style.display='none';sf.textContent='إضافة صنف جديد';}}
/*
// --- تم تعليق دوال معالجة رفع الصور مؤقتًا ---
function handleStaffImageFileSelect(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('item-image-preview-staff-form');
    if (!preview) return;
    if (file) {
        if(file.size > 2*1024*1024){showToast("حجم الصورة كبير (2MB حد أقصى).","error");event.target.value='';preview.style.display='none';selectedImageFileStaff=null;return;}
        if(!file.type.startsWith('image/')){showToast("اختر ملف صورة.","error");event.target.value='';preview.style.display='none';selectedImageFileStaff=null;return;}
        const reader = new FileReader();
        reader.onload = (e) => { preview.src = e.target.result; preview.style.display='block'; }
        reader.readAsDataURL(file);
        selectedImageFileStaff = file;
        document.getElementById('item-image-url-staff-form').value='';
    } else {
        preview.style.display = 'none';
        selectedImageFileStaff = null;
    }
}

function readFileAsBase64(file) {
    console.log("[readFileAsBase64] Called for file:", file ? file.name : "No file object");
    return new Promise((resolve, reject) => {
        if (!(file instanceof Blob)) {
            console.error("[readFileAsBase64] Invalid file object provided.");
            reject(new Error("الملف غير صالح للقراءة."));
            return;
        }
        // السطر التالي هو مكان تعريف 'reader'.
        const reader = new FileReader(); // <--- هذا السطر هو مكان الخطأ المحتمل
        console.log("[readFileAsBase64] FileReader object created.");

        reader.onload = function(loadEvent) {
            console.log("[readFileAsBase64] FileReader onload triggered.");
            try {
                const result = loadEvent.target.result;
                if (result && typeof result === 'string') {
                    const parts = result.split(',');
                    if (parts.length === 2 && parts[0].includes('base64')) {
                        console.log("[readFileAsBase64] Base64 data extracted successfully.");
                        resolve(parts[1]);
                    } else {
                        console.error("[readFileAsBase64] FileReader result format incorrect. Received:", result.substring(0,100) + "...");
                        reject(new Error("تنسيق بيانات الملف غير صحيح بعد القراءة."));
                    }
                } else {
                    console.error("[readFileAsBase64] FileReader result is null, undefined, or not a string.");
                    reject(new Error("لم يتم تحميل بيانات الملف بشكل صحيح من FileReader."));
                }
            } catch (e) {
                console.error("[readFileAsBase64] Error processing FileReader result in onload:", e);
                reject(e);
            }
        };
        reader.onerror = function(errorEvent) {
            console.error("[readFileAsBase64] FileReader onerror triggered:", reader.error);
            reject(reader.error || new Error("حدث خطأ أثناء قراءة الملف: " + (reader.error ? reader.error.message : "Unknown error")));
        };
        try {
            console.log("[readFileAsBase64] Calling reader.readAsDataURL()...");
            reader.readAsDataURL(file);
            console.log("[readFileAsBase64] reader.readAsDataURL() called successfully.");
        } catch (e) {
            console.error("[readFileAsBase64] Exception on readAsDataURL:", e);
            reject(e);
        }
    });
}
*/

async function handleSaveStaffMenuItem() {
    console.log("[handleSaveStaffMenuItem] Called.");
    const itemId = document.getElementById('edit-item-id-staff').value;
    const nameField = document.getElementById('item-name-staff-form');
    const descField = document.getElementById('item-description-staff-form');
    const priceField = document.getElementById('item-price-staff-form');
    const categoryField = document.getElementById('item-category-staff-form');
    const imageUrlField = document.getElementById('item-image-url-staff-form');
    const availableCheck = document.getElementById('item-available-staff-form');

    if (!nameField || !descField || !priceField || !categoryField || !imageUrlField || !availableCheck) {
        showToast("خطأ: بعض حقول النموذج غير موجودة في DOM.", "error"); return;
    }

    const itemData = {
        id: itemId, name_ar: nameField.value, description_ar: descField.value,
        price: parseFloat(priceField.value), category_ar: categoryField.value,
        imageUrl: imageUrlField.value, // الاعتماد على رابط URL المدخل فقط
        isAvailable: availableCheck.checked
        // لا يوجد itemData.imageFile لأننا علقنا وظيفة رفع الملفات
    };

    if (!itemData.name_ar || isNaN(itemData.price) || !itemData.category_ar) {
        showToast("يرجى ملء الحقول الإلزامية (الاسم، السعر، الفئة) بشكل صحيح.", "error"); return;
    }

    // لا يوجد selectedImageFileStaff الآن، نرسل البيانات مباشرة
    console.log("[handleSaveStaffMenuItem] No image file processing (currently disabled). Sending data directly.");
    await sendMenuItemData(itemData, itemId);
}


async function sendMenuItemData(itemData, itemId) {
    let response;
    if (itemId) {
        console.log("Updating item with data (ID):", itemData.id);
        response = await callGoogleScriptAPI('updateMenuItem', { itemData });
    } else {
        console.log("Adding new item with data (Name):", itemData.name_ar);
        response = await callGoogleScriptAPI('addMenuItem', { itemData });
    }
    if (response.success) {
        showToast(response.message || (itemId ? "تم تحديث الصنف." : "تمت إضافة الصنف."), 'success');
        toggleAddEditItemFormStaff(false);
        loadStaffMenuItemsForEditing();
        loadMenuDataForStaff();
        // selectedImageFileStaff = null; // معلق
        // const imageFileInput = document.getElementById('item-image-file-staff-form'); // معلق
        // if (imageFileInput) imageFileInput.value = ''; // معلق
    } else {
        showToast(`خطأ: ${response.message || "فشل حفظ الصنف"}`, "error");
    }
}

function cancelEditStaffMenuItem() { toggleAddEditItemFormStaff(false); }
async function loadStaffMenuItemsForEditing() { const c=document.getElementById('menu-items-list-manager-staff'); if(!c)return;c.innerHTML='<p class="loading-text">جاري التحميل...</p>'; const r=await callGoogleScriptAPI('getMenuItems',{forManager:true}); if(r.success){menuData=r.data;renderStaffMenuItemsForEditing(menuData);} else c.innerHTML=`<p style="color:red;">${r.message||'فشل'}</p>`;}
function renderStaffMenuItemsForEditing(items) { const c=document.getElementById('menu-items-list-manager-staff'); if(!c)return;c.innerHTML=''; if(!items?.length){c.innerHTML='<p>لا أصناف.</p>';return;} items.forEach(i=>{const ie=document.createElement('div');ie.className='menu-item-entry';ie.innerHTML=`<div class="item-details"><strong>${i.name}</strong> (${i.category||'N/A'}) - ${i.price!=null ? i.price.toFixed(2) : 'N/A'} ريال<br><small>${i.description||''}</small><br><small style="color:${i.isAvailable===false?'var(--danger-color)':'var(--success-color)'}">الحالة: ${i.isAvailable===false?'غير متوفر':'متوفر'}</small></div><div class="item-actions"><button class="button-secondary button-small" onclick="openEditStaffMenuItemModal('${i.id}')"><i class="fas fa-edit"></i> تعديل</button></div>`;c.appendChild(ie);});}
function openEditStaffMenuItemModal(itemId) { console.log("Editing item:", itemId); const itemToEdit = menuData.find(item => item.id === itemId); if (itemToEdit) toggleAddEditItemFormStaff(true, itemToEdit); else { showToast("الصنف غير موجود.", "error"); console.error("Item not found for edit:", itemId, menuData); loadStaffMenuItemsForEditing().then(() => { const freshItemToEdit = menuData.find(item => item.id === itemId); if (freshItemToEdit) toggleAddEditItemFormStaff(true, freshItemToEdit); else console.error("Item still not found after reloading for edit."); });}}
async function loadStaffSubscriptionDetails() { const da=document.getElementById('subscription-details-area-staff'); if(!da)return;da.innerHTML='<p class="loading-text">جاري التحميل...</p>'; const r=await callGoogleScriptAPI('checkSubscriptionStatus',{}); if(r){let h=`<p>الحالة: <span class="${r.isActive?'active':'expired'}">${r.isActive?'سارٍ':'منتهي'}</span></p>`; if(r.endDate)h+=`<p>ينتهي: <strong>${new Date(r.endDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>`; if(r.isActive && r.daysRemaining !== undefined)h+=`<p>متبقي: <strong>${r.daysRemaining} يومًا</strong></p>`; else if(!r.isActive)h+=`<p style="color:var(--danger-color);">الاشتراك منتهي!</p>`; h+=`<p><small>${r.message}</small></p>`;da.innerHTML=h;} else da.innerHTML='<p style="color:red;">فشل.</p>';}
function renderStaffWaiterMenu(allItems) { const c = document.getElementById('waiter-menu-items-container-staff'); if (!c) { console.error("Waiter menu container for staff not found"); return; } c.innerHTML = ''; let itd = allItems; if (currentStaffWaiterSearchTerm) itd = itd.filter(i => i.name.toLowerCase().includes(currentStaffWaiterSearchTerm) || (i.description && i.description.toLowerCase().includes(currentStaffWaiterSearchTerm))); if (!itd?.length) { let m = `لا توجد أصناف.`; if (currentStaffWaiterSearchTerm) m = `لا توجد أصناف تطابق البحث "${currentStaffWaiterSearchTerm}".`; c.innerHTML = `<p class="loading-text">${m}</p>`; return; } itd.forEach(i => { const ic = document.createElement('div'); ic.className = 'menu-item-card compact-item'; ic.innerHTML = `${i.imageUrl ? `<img src="${i.imageUrl}" alt="${i.name}">` : '<div class="small-placeholder">صورة</div>'}<div class="menu-item-content"><div class="item-info"><h4>${i.name}</h4><p class="menu-item-price">${(typeof i.price === 'number' ? i.price.toFixed(2) : 'N/A')} ريال</p></div><div class="menu-item-actions"><input type="number" id="waiter-qty-${i.id}-staff" value="1" min="1" class="item-quantity"><button class="button-primary small-button" onclick="addStaffToWaiterCart('${i.id}', '${i.name}', ${i.price})"><i class="fas fa-plus"></i></button></div></div>`; c.appendChild(ic); }); }
function addStaffToWaiterCart(itemId, itemName, itemPrice) { if (typeof itemPrice !== 'number') { showToast("السعر غير متوفر.", "error"); return; } const qi = document.getElementById(`waiter-qty-${itemId}-staff`); const q = qi ? (parseInt(qi.value) || 1) : 1; if(q<1){showToast("الكمية 1+","error");if(qi)qi.value=1;return;} const ei = staffWaiterCart.find(i => i.id === itemId); if (ei) ei.quantity += q; else staffWaiterCart.push({ id: itemId, name: itemName, price: itemPrice, quantity: q }); if (qi) qi.value = 1; renderStaffWaiterCart(); }
function renderStaffWaiterCart() { const ciu = document.getElementById('waiter-cart-items-staff'), cts = document.getElementById('waiter-cart-total-staff'); if (!ciu || !cts) return; ciu.innerHTML = ''; let t = 0; if(staffWaiterCart.length === 0) ciu.innerHTML = '<li class="empty-cart-message">السلة فارغة.</li>'; else staffWaiterCart.forEach((i, idx) => { const li = document.createElement('li'); li.innerHTML = `<span>${i.name} (x${i.quantity})</span><span>${(i.price * i.quantity).toFixed(2)} ر.س</span><button class="remove-item small-remove" onclick="removeStaffFromWaiterCart(${idx})" title="إزالة"><i class="fas fa-times"></i></button>`; ciu.appendChild(li); t += i.price * i.quantity; }); cts.textContent = t.toFixed(2); }
function removeStaffFromWaiterCart(index) { staffWaiterCart.splice(index, 1); renderStaffWaiterCart(); }
async function submitStaffWaiterOrder() { const tif = document.getElementById('waiter-table-id-staff'); const onf = document.getElementById('order-notes-waiter-staff'); if(!tif)return; const ti = tif.value.trim(); const onv = onf ? onf.value.trim() : ''; if (staffWaiterCart.length === 0) { showToast("السلة فارغة!", "error"); return; } if (!ti) { showToast("ادخل الطاولة.", "error"); return; } if (!currentUser || currentUser.role !== 'waiter') { showToast("غير مصرح.", "error"); return; } const od = { tableOrCustomerId: ti, items: staffWaiterCart.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })), totalPrice: parseFloat(document.getElementById('waiter-cart-total-staff').textContent), waiterId: currentUser.userId, orderType: 'dine-in-staff', orderNotes: onv }; const r = await callGoogleScriptAPI('submitOrder', { orderData: od }); if (r.success) { showToast(`تم الطلب ${r.orderId}.`, 'success'); staffWaiterCart = []; renderStaffWaiterCart(); tif.value = ''; if(onf)onf.value=''; } else showToast(`خطأ: ${r.message||"فشل"}`, "error"); }
async function loadStaffWaiterOrders() { const old = document.getElementById('waiter-orders-list-staff'); if (!old) return; old.innerHTML = '<p class="loading-text">جاري تحميل الطلبات...</p>'; const r = await callGoogleScriptAPI('getOrders', { statusFilter: ["جديد", "قيد التجهيز", "جاهز للتسليم"] }); if (r.success) renderStaffOrders(r.data, old, false, true); else old.innerHTML = `<p class="loading-text" style="color:red;">${r.message||'فشل'}</p>`;}
async function loadStaffKitchenOrders() { const old = document.getElementById('kitchen-orders-list-staff'); if (!old) return; if (!old.innerHTML.includes('order-card') && !old.innerHTML.includes('لا توجد')) old.innerHTML = '<p class="loading-text">جاري تحميل الطلبات...</p>'; const r = await callGoogleScriptAPI('getOrders', { statusFilter: ["جديد", "قيد التجهيز"] }); if (r.success) { const fo = r.data.filter(o => o.status === 'جديد' || o.status === 'قيد التجهيز'); renderStaffOrders(fo, old, true, false); } else old.innerHTML = `<p class="loading-text" style="color:red;">${r.message||'فشل'}</p>`;}
function renderStaffOrders(orders, container, isKitchenView, isWaiterView = false) { if (!container) return; container.innerHTML = ''; if (!orders?.length) { container.innerHTML = '<p class="loading-text">لا طلبات.</p>'; return; } orders.forEach(o => { const oc = document.createElement('div'); const sc = o.status ? o.status.replace(/\s+/g, '-') : 'na'; oc.className = `order-card order-status-${sc}`; let ih = '<ul>'; if (o.items?.length) o.items.forEach(i => { ih += `<li>${i.name||'?'} (x${i.quantity||'?'})</li>`; }); else ih += '<li>لا تفاصيل</li>'; ih += '</ul>'; let ab = ''; if (isKitchenView && o.status) { if (o.status === 'جديد') ab = `<div class="order-actions"><button class="button-secondary" onclick="updateStaffOrderStatusWrapper('${o.orderId}','قيد التجهيز')"><i class="fas fa-hourglass-half"></i> للتجهيز</button></div>`; else if (o.status === 'قيد التجهيز') ab = `<div class="order-actions"><button class="button-success" onclick="updateStaffOrderStatusWrapper('${o.orderId}','جاهز للتسليم')"><i class="fas fa-check-circle"></i> جاهز</button></div>`; } else if (isWaiterView && o.status === 'جاهز للتسليم') { ab = `<div class="order-actions"><button class="button-success" onclick="markOrderAsDeliveredByWaiter('${o.orderId}')"><i class="fas fa-people-carry"></i> تم التسليم</button></div>`; } const totalPriceDisplay = (typeof o.totalPrice === 'number' || (typeof o.totalPrice === 'string' && !isNaN(parseFloat(o.totalPrice)))) ? parseFloat(o.totalPrice).toFixed(2) : 'N/A'; const orderNotesHtml = o.orderNotes ? `<div class="order-notes-display"><p><strong>ملاحظات الطلب:</strong></p><p>${o.orderNotes.replace(/\n/g, '<br>')}</p></div>` : ''; oc.innerHTML = `<h4>طلب ${o.orderId||'N/A'} ( ${o.tableOrCustomerId||'N/A'})</h4><p><strong>الحالة:</strong> ${o.status||'N/A'}</p><p><strong>الوقت:</strong> ${o.timestamp?new Date(o.timestamp).toLocaleString('ar-SA'):'N/A'}</p><p><strong>نوع الطلب:</strong> ${o.orderType || 'N/A'}</p>${o.customerName ? `<p><strong>اسم العميل:</strong> ${o.customerName}</p>` : ''}${o.customerPhone ? `<p><strong>جوال العميل:</strong> ${o.customerPhone}</p>` : ''}${orderNotesHtml}<p><strong>المنتجات:</strong></p>${ih}<p><strong>الإجمالي:</strong> ${totalPriceDisplay} ريال</p>${ab}`; container.appendChild(oc); }); }
async function updateStaffOrderStatusWrapper(orderId, newStatus) { const r = await callGoogleScriptAPI('updateOrderStatus', { orderId, newStatus }); if (r.success) { showToast(r.message, 'success'); if (currentUser?.role === 'kitchen') loadStaffKitchenOrders(); if (currentUser?.role === 'waiter') loadStaffWaiterOrders(); } else showToast(`خطأ: ${r.message||"فشل"}`, "error"); }
async function markOrderAsDeliveredByWaiter(orderId) { console.log(`Waiter marking ${orderId} as delivered.`); await updateStaffOrderStatusWrapper(orderId, 'تم التسليم');}
async function generateStaffTableQR() { const tii=document.getElementById('table-id-input-staff'),qo=document.getElementById('qrcodeOutput-staff'),qi=document.getElementById('qr-info-staff'); if(!tii||!qo||!qi)return; const tid=tii.value.trim(); qo.innerHTML='';qi.textContent=''; if(!tid){showToast("ادخل معرف الطاولة.","error");return;} const r=await callGoogleScriptAPI('addTable',{tableId:tid}); if(r.success&&r.qrData){qi.textContent=`QR للطاولة: ${r.tableId}.`;if(typeof QRCode!=='undefined')new QRCode(qo,{text:r.qrData,width:128,height:128});else console.error("QRCode lib not loaded!");showToast(`QR للطاولة ${r.tableId} جاهز.`,"success");} else showToast(`خطأ QR: ${r.message||"فشل"}`,"error");}
async function loadStaffSalesReport() { const ra=document.getElementById('sales-report-area-staff'); if(!ra)return;ra.innerHTML="<p class=\"loading-text\">جاري التحميل...</p>"; const sd = document.getElementById('report-start-date-staff').value; const ed = document.getElementById('report-end-date-staff').value; if (sd && ed && new Date(sd) > new Date(ed)) { showToast("تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء.", "error"); ra.innerHTML = "<p style='color:red;'>تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء.</p>"; return;} const r=await callGoogleScriptAPI('getSalesReport',{startDate: sd, endDate: ed}); if(r.success){let h=`<h3><i class="fas fa-file-invoice-dollar"></i> تقرير ${sd?'من '+sd:''} ${ed?'إلى '+ed:''}</h3><p><strong>إجمالي المبيعات:</strong> ${r.totalSalesValue?.toFixed(2)||'0.00'} ريال</p><h4>إحصائيات:</h4><ul><li>إجمالي الطلبات (مسلمة): ${r.totalOrdersCount||0}</li><li>طلبات توصيل: ${r.deliveryOrdersCount||0}</li><li>طلبات استلام: ${r.pickupOrdersCount||0}</li><li>طلبات طاولات: ${r.dineInOrdersCount||0}</li></ul><h4>المنتجات المباعة (كمية):</h4><ul>`; if(r.productSales&&Object.keys(r.productSales).length>0){for(const pn in r.productSales)h+=`<li>${pn}: ${r.productSales[pn]}</li>`;}else h+='<li>لم تبع منتجات.</li>'; h+=`</ul><button class="button-secondary" onclick="printStaffReport()"><i class="fas fa-print"></i> طباعة</button>`;ra.innerHTML=h;} else ra.innerHTML=`<p style="color:red;">خطأ: ${r.message||'فشل'}</p>`;}
function printStaffReport() { const rce=document.getElementById('sales-report-area-staff'); if(!rce)return; const rc=rce.innerHTML; const pw=window.open('','_blank','height=600,width=800'); if(pw){pw.document.write(`<html><head><title>تقرير</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"><link href="https://fonts.googleapis.com/css2?family=Cairo&display=swap" rel="stylesheet"><style>body{font-family:"Cairo",sans-serif;direction:rtl;padding:20px;}button{display:none!important;}</style></head><body>${rc}</body></html>`);pw.document.close();pw.focus();setTimeout(()=>pw.print(),500);} else showToast("فشل فتح الطباعة.","error");}
async function createNewStaffSystemUser() { const uf=document.getElementById('new-username-staff'),pf=document.getElementById('new-password-staff'),rf=document.getElementById('new-user-role-staff'); if(!uf||!pf||!rf)return; const ud={username:uf.value,password:pf.value,role:rf.value}; if(!ud.username||!ud.password||!ud.role){showToast("املأ الحقول.","error");return;} const r=await callGoogleScriptAPI('createNewUser',{userData:ud}); if(r.success){showToast(r.message,'success');uf.value='';pf.value='';} else showToast(`خطأ: ${r.message||"فشل"}`, "error");}

// ========================== CLIENT (index.html) LOGIC ==========================
async function checkClientSubscriptionAndInitialize() {
    showLoading(true, 'main');
    const subscriptionResponse = await callGoogleScriptAPI('checkSubscriptionStatus', {});
    showLoading(false, 'main');
    const overlayClient = document.getElementById('subscription-expired-overlay-client');
    const mainContentClient = document.getElementById('main-content-client');
    const messageClient = document.getElementById('subscription-expired-message-client');
    if (overlayClient && mainContentClient && messageClient) {
        if (subscriptionResponse && subscriptionResponse.isActive) {
            console.log("Client subscription is active.");
            overlayClient.style.display = 'none'; mainContentClient.style.display = 'block';
            initializeClientMenuPage();
        } else {
            console.log("Client subscription expired or error.");
            overlayClient.style.display = 'flex'; mainContentClient.style.display = 'none';
            messageClient.textContent = subscriptionResponse.message || "الاشتراك غير سارٍ.";
        }
    } else { console.error("Client subscription overlay/content elements not found!"); initializeClientMenuPage(); }
}
function initializeClientMenuPage() {
    console.log("Init Client Page..."); showLoading(false, 'main');
    try {
        const su = sessionStorage.getItem('currentUser');
        if (su) { console.log("Staff session on client page"); const sl=document.querySelector('.staff-login-link'); if(sl)sl.style.display='none'; const lb=document.getElementById('logout-button-client'); if(lb)lb.style.display='block'; }
        else { const lb=document.getElementById('logout-button-client'); if(lb)lb.style.display='none'; }
    } catch(e){}
    document.getElementById('open-cart-button-client')?.addEventListener('click',()=>toggleClientCartPanel(true));
    document.getElementById('close-cart-panel-button-client')?.addEventListener('click',()=>toggleClientCartPanel(false));
    document.getElementById('cart-overlay-client')?.addEventListener('click',()=>toggleClientCartPanel(false));
    document.getElementById('submit-order-button-client-panel')?.addEventListener('click',submitClientOrder);
    document.getElementById('toggle-view-button-client')?.addEventListener('click',handleClientToggleView);
    document.getElementById('logout-button-client')?.addEventListener('click',handleStaffLogoutFromClientPage);
    document.getElementById('order-type-client')?.addEventListener('change', handleOrderTypeChangeClient);
    document.getElementById('search-menu-client')?.addEventListener('input', (event) => { currentClientSearchTerm = event.target.value.toLowerCase(); renderClientMenu(menuData, currentClientMenuFilter); });
    const toggleOrderDetailsButton = document.getElementById('toggle-order-details-button-client');
    if (toggleOrderDetailsButton) {
        console.log("Toggle order details button found. Adding event listener.");
        toggleOrderDetailsButton.addEventListener('click', () => {
            console.log("Toggle order details button CLICKED.");
            const content = document.getElementById('order-details-content-client');
            const icon = toggleOrderDetailsButton.querySelector('i');
            if (content) {
                if (content.style.display === 'none' || !content.style.display) {
                    console.log("Opening order details content."); content.style.display = 'block';
                    toggleOrderDetailsButton.classList.add('open'); if(icon) icon.className = 'fas fa-chevron-up';
                } else {
                    console.log("Closing order details content."); content.style.display = 'none';
                    toggleOrderDetailsButton.classList.remove('open'); if(icon) icon.className = 'fas fa-chevron-down';
                }
            } else { console.error("Order details content ('order-details-content-client') not found!"); }
        });
    } else { console.error("Toggle order details button ('toggle-order-details-button-client') not found!"); }
    showClientPageContent('menu-view-client'); loadClientMenuItemsAndCategories(); renderClientCart();
    handleOrderTypeChangeClient();
}
function handleOrderTypeChangeClient() { const ots=document.getElementById('order-type-client'),did=document.getElementById('delivery-info-client'),cii=document.getElementById('customer-identifier-client-panel'),otsd=document.getElementById('order-type-selection-client'); if(!ots||!did||!cii||!otsd)return; if(currentTableIdFromQR){otsd.style.display='none';did.style.display='none';cii.style.display='block';cii.value=`طاولة ${currentTableIdFromQR}`;cii.placeholder='رقم الطاولة';return;} otsd.style.display='block'; if(ots.value==='delivery'){did.style.display='block';cii.style.display='none';cii.value='';} else{did.style.display='none';cii.style.display='block';cii.placeholder='اسم المستلم (للاستلام)';cii.value='';}}
function handleClientToggleView() { const mc=document.getElementById('menu-items-container-client'),vi=document.querySelector('#toggle-view-button-client i'); if(!mc||!vi)return; if(mc.classList.contains('single-column-view')){mc.classList.remove('single-column-view');mc.classList.add('two-columns-view');vi.className='fas fa-bars';} else{mc.classList.remove('two-columns-view');mc.classList.add('single-column-view');vi.className='fas fa-th-large';}}
function handleStaffLogoutFromClientPage() { console.log("Staff logging out from client page."); try { sessionStorage.removeItem('currentUser');sessionStorage.removeItem('lastSubscriptionCheck'); console.log("Staff session removed.");} catch (e) { console.error("Session remove error:", e); } updateClientUIVisibility('menu-view-client'); const sl=document.querySelector('.staff-login-link'); if(sl)sl.style.display='block'; showToast("تم تسجيل خروج الموظف.", "info");}
function toggleClientCartPanel(open) { const cp=document.getElementById('cart-panel-client'), co=document.getElementById('cart-overlay-client'); const odcc = document.getElementById('order-details-content-client'); const todbtn = document.getElementById('toggle-order-details-button-client'); const todicon = todbtn?.querySelector('i'); if(!cp||!co)return; if(open){cp.classList.add('open');co.classList.add('open');document.body.style.overflow='hidden'; if (!currentTableIdFromQR) handleOrderTypeChangeClient(); if(odcc) odcc.style.display = 'none'; if(todbtn) todbtn.classList.remove('open'); if(todicon) todicon.className = 'fas fa-chevron-down'; } else{cp.classList.remove('open');co.classList.remove('open');document.body.style.overflow='';}}
function showClientPageContent(pageId) { console.log("Show client page:", pageId); document.querySelectorAll('#app-container .main-content > .page').forEach(p=>p.classList.remove('active')); const tp=document.getElementById(pageId); if(tp) tp.classList.add('active'); else { console.error("Page",pageId,"not found. Defaulting."); const dp = document.getElementById('menu-view-client'); if(dp) dp.classList.add('active'); pageId = 'menu-view-client';} updateClientAppTitle(pageId); updateClientUIVisibility(pageId); }
function updateClientAppTitle(pageId){ const at=document.getElementById('app-title'); if(!at)return; if(pageId==='menu-view-client') at.innerHTML='<i class="fas fa-utensils"></i> قائمة الطعام'; }
function updateClientUIVisibility(currentPageId) { console.log("Update client UI. Staff Session:",!!sessionStorage.getItem('currentUser'),"Page:",currentPageId); const lb=document.getElementById('logout-button-client'), ocb=document.getElementById('open-cart-button-client'); let iss=!!sessionStorage.getItem('currentUser'); if(lb)lb.style.display=iss?'block':'none'; if(ocb)ocb.style.display=(currentPageId==='menu-view-client'&&!iss)?'flex':'none'; if(iss || currentPageId !== 'menu-view-client'){ const cp=document.getElementById('cart-panel-client'); if(cp?.classList.contains('open'))toggleClientCartPanel(false);}}
async function loadClientMenuItemsAndCategories() { const mc=document.getElementById('menu-items-container-client'); if(mc&&(!mc.innerHTML||mc.innerHTML.includes('loading-text')))mc.innerHTML='<p class="loading-text">جاري التحميل...</p>'; const r=await callGoogleScriptAPI('getMenuItems'); if(r.success){menuData=r.data;renderClientCategoryButtons(menuData);renderClientMenu(menuData,currentClientMenuFilter);} else{if(mc)mc.innerHTML=`<p class="loading-text" style="color:red;">${r.message||'فشل'}</p>`;const cc=document.getElementById('category-buttons-container-client');if(cc)cc.innerHTML='';}}
function renderClientCategoryButtons(items) { const c=document.getElementById('category-buttons-container-client'); if(!c)return; c.innerHTML=''; const cats=['all', ...new Set(items.map(i=>i.category))]; cats.forEach(cat=>{ const b=document.createElement('button');b.textContent=cat==='all'?'الكل':cat;b.dataset.categoryFilter=cat; if(cat===currentClientMenuFilter)b.classList.add('active-category'); b.addEventListener('click',()=>{currentClientMenuFilter=cat;renderClientMenu(menuData,currentClientMenuFilter);c.querySelectorAll('button').forEach(btn=>btn.classList.remove('active-category'));b.classList.add('active-category');}); c.appendChild(b); });}
function renderClientMenu(allItems, filterCategory = 'all') { const c=document.getElementById('menu-items-container-client'); if(!c)return; c.innerHTML=''; let itd=allItems; if(filterCategory!=='all')itd=itd.filter(i=>i.category===filterCategory); if(currentClientSearchTerm)itd=itd.filter(i=>i.name.toLowerCase().includes(currentClientSearchTerm)||(i.description&&i.description.toLowerCase().includes(currentClientSearchTerm))); if(!itd?.length){let m=`لا أصناف`;if(filterCategory!=='all')m+=` في "${filterCategory}"`;if(currentClientSearchTerm)m+=` تطابق "${currentClientSearchTerm}"`;c.innerHTML=`<p class="loading-text">${m}.</p>`;return;} if(filterCategory!=='all'&&!currentClientSearchTerm){const ch=document.createElement('h2');ch.className='menu-category-header';ch.textContent=filterCategory;c.appendChild(ch);} itd.forEach(i=>{const ipwv=parseFloat(i.price);const ic=document.createElement('div');ic.className='menu-item-card';ic.innerHTML=`${i.imageUrl?`<img src="${i.imageUrl}" alt="${i.name}">`:'<div class="no-image-placeholder">لا صورة</div>'}<div class="menu-item-content"><h4>${i.name}</h4><p class="description">${i.description||'لا وصف.'}</p><p class="menu-item-price">${ipwv.toFixed(2)} ريال</p><div class="menu-item-actions"><input type="number" id="qty-client-${i.id}" value="1" min="1" class="item-quantity"><button class="button-primary" onclick="addClientToCart('${i.id}','${i.name}',${ipwv})"><i class="fas fa-cart-plus"></i> للسلة</button></div></div>`;c.appendChild(ic);});}
function updateClientCartCount() { const cb=document.getElementById('cart-count-badge-header-client'); if(!cb)return; const tq=clientCart.reduce((s,i)=>s+i.quantity,0); cb.textContent=tq; cb.style.display=tq>0?'flex':'none'; }
function addClientToCart(itemId, itemName, itemPriceWithVAT) { if(sessionStorage.getItem('currentUser')){showToast("الموظفون لا يستخدمون سلة العملاء.","info");return;} if(typeof itemPriceWithVAT!=='number'){showToast("السعر غير متوفر.","error");return;} const qi=document.getElementById(`qty-client-${itemId}`); const q=qi?(parseInt(qi.value)||1):1; if(q<1){showToast("الكمية 1+","error");if(qi)qi.value=1;return;} const ei=clientCart.find(i=>i.id===itemId); if(ei)ei.quantity+=q; else clientCart.push({id:itemId,name:itemName,priceWithVAT:itemPriceWithVAT,quantity:q}); if(qi)qi.value=1; renderClientCart(); showToast(`تمت إضافة "${itemName}"!`, 'success');}
function renderClientCart() { const ciu=document.getElementById('cart-items-client-panel'),csis=document.getElementById('cart-subtotal-inclusive-client-panel'),cvas=document.getElementById('cart-vat-amount-client-panel'),ctfs=document.getElementById('cart-total-final-client-panel'); if(!ciu||!csis||!cvas||!ctfs)return; ciu.innerHTML=''; let tsi=0; if(clientCart.length===0)ciu.innerHTML='<li class="empty-cart-message">السلة فارغة.</li>'; else{clientCart.forEach((i,idx)=>{const idt=i.priceWithVAT*i.quantity;const li=document.createElement('li');li.innerHTML=`<span class="cart-item-name">${i.name}</span><div class="cart-item-details"><span class="cart-item-quantity">x${i.quantity}</span><span class="cart-item-price">${idt.toFixed(2)} ر.س</span><button class="remove-item" onclick="removeClientFromCart(${idx})" title="إزالة"><i class="fas fa-trash-alt"></i></button></div>`;ciu.appendChild(li);tsi+=idt;});} const obp=tsi/(1+VAT_RATE); const tva=tsi-obp; csis.textContent=tsi.toFixed(2);cvas.textContent=tva.toFixed(2);ctfs.textContent=tsi.toFixed(2); updateClientCartCount();}
function removeClientFromCart(index) { if(clientCart[index]){const rin=clientCart[index].name;clientCart.splice(index,1);renderClientCart();showToast(`تمت إزالة "${rin}".`,'info');}}
async function submitClientOrder() { const cif=document.getElementById('customer-identifier-client-panel'),ots=document.getElementById('order-type-client'),cnf=document.getElementById('customer-name-client-panel'),cpf=document.getElementById('customer-phone-client-panel'),onf=document.getElementById('order-notes-client-panel'); if(!cif)return; if(clientCart.length===0){showToast("السلة فارغة!","error");return;} let otv='',cnv='',cpv='',tciv='',onv=onf?onf.value.trim():''; if(currentTableIdFromQR){otv='dine-in';tciv=`طاولة ${currentTableIdFromQR}`;cif.value=tciv;cnv=`طاولة ${currentTableIdFromQR}`;}else if(ots){otv=ots.value;if(otv==='delivery'){if(!cnf||!cpf)return;cnv=cnf.value.trim();cpv=cpf.value.trim();if(!cnv){showToast("يرجى إدخال الاسم الكامل للتوصيل.","error");cnf.focus();return;}if(!cpv){showToast("يرجى إدخال رقم الجوال للتوصيل.","error");cpf.focus();return;}tciv=`توصيل: ${cnv} - ${cpv}`;}else{cnv=cif.value.trim();if(!cnv && otv === 'pickup'){showToast("يرجى إدخال اسم المستلم لطلب الاستلام.","error"); cif.focus(); return;}tciv=cnv?`استلام: ${cnv}`:"استلام من المطعم";}}else{showToast("حدد نوع الطلب.","error");return;} let csi=0;clientCart.forEach(i=>{csi+=i.priceWithVAT*i.quantity;}); const obp=csi/(1+VAT_RATE);const ctv=csi-obp;const ftp=csi; const its=clientCart.map(i=>{const ipwv=i.priceWithVAT;const ibp=ipwv/(1+VAT_RATE);return{id:i.id,name:i.name,quantity:i.quantity,price:ibp,priceWithVAT:ipwv,itemTotalBeforeVAT:ibp*i.quantity,itemTotalWithVAT:ipwv*i.quantity};}); const od={tableOrCustomerId:tciv,orderType:otv,customerName:cnv,customerPhone:cpv,items:its,subTotalPriceBeforeVAT:ftp-ctv,totalVatAmount:ctv,totalPrice:ftp, orderNotes: onv}; console.log("Submitting client order:",od); const r=await callGoogleScriptAPI('submitOrder',{orderData:od}); if(r.success){showToast(`تم إرسال طلبك ${r.orderId}!`,'success',5000);clientCart=[];renderClientCart();if(cif&&!currentTableIdFromQR)cif.value='';if(cnf)cnf.value='';if(cpf)cpf.value='';if(onf)onf.value='';if(ots&&!currentTableIdFromQR){ots.value='pickup';handleOrderTypeChangeClient();}toggleClientCartPanel(false);}else{showToast(`خطأ: ${r.message||"فشل"}`,"error");}}