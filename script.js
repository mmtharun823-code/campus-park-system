// ─── Firebase Imports ────────────────────────────────────────────────────────
import { db, auth } from './firebase-config.js';
import {
    collection, addDoc, onSnapshot, getDocs,
    query, orderBy, serverTimestamp, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ─── Auth Guard & Logout ──────────────────────────────────────────────────────
// ─── Auth Guard & Logout ──────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Admin logged in:", user.email);
        // sessionStorage.setItem('isAdmin', 'true'); // redundantly set if needed
    } else {
        console.log("No user session active.");
        if (sessionStorage.getItem('isAdmin') !== 'true') {
            window.location.href = 'index.html';
        }
    }
});

document.getElementById('btn-logout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    sessionStorage.removeItem('isAdmin');
    window.location.href = 'index.html';
});

// ─── Firebase Collection & Operations ──────────────────────────────────────────
const PLATES_COLLECTION = 'plates';
const AUTHORIZED_VEHICLES_COLLECTION = 'authorized_vehicles';
const platesRef = collection(db, PLATES_COLLECTION);
const authorizedVehiclesRef = collection(db, AUTHORIZED_VEHICLES_COLLECTION);

/**
 * Saves plate data to Firestore with specified fields
 */
async function savePlateData(plateNumber, accessStatus = "IN", gate = "Gate 1", isAuthorized = false) {
    try {
        await addDoc(platesRef, {
            plate: plateNumber,
            timestamp: serverTimestamp(),
            status: accessStatus,
            camera: gate,
            isAuthorized: isAuthorized
        });
        console.log("✅ Data saved to Firestore");
    } catch (e) {
        console.error("❌ Error adding document: ", e);
    }
}

/**
 * Checks if a vehicle is authorized
 */
async function checkVehicleAuthorization(plateNumber) {
    try {
        const q = query(authorizedVehiclesRef);
        const querySnapshot = await getDocs(q);
        
        for (const doc of querySnapshot.docs) {
            const vehicleData = doc.data();
            if (vehicleData.plateNumber && vehicleData.plateNumber.toUpperCase() === plateNumber.toUpperCase()) {
                return {
                    isAuthorized: true,
                    vehicleInfo: {
                        ownerName: vehicleData.ownerName || 'Unknown',
                        vehicleType: vehicleData.vehicleType || 'Car',
                        department: vehicleData.department || 'General'
                    }
                };
            }
        }
        
        return { isAuthorized: false, vehicleInfo: null };
    } catch (error) {
        console.error('Error checking authorization:', error);
        return { isAuthorized: false, vehicleInfo: null };
    }
}

/**
 * Callback for when a plate is successfully detected
 */
async function onPlateDetected(detectedText) {
    console.log("Detected Plate:", detectedText);

    // Check authorization
    const authResult = await checkVehicleAuthorization(detectedText);
    
    if (authResult.isAuthorized) {
        // Find last status to toggle IN/OUT
        const lastEntry = allLogs.find(log => log.plate.toUpperCase() === detectedText.toUpperCase());
        const nextStatus = (lastEntry && lastEntry.status === 'IN') ? 'OUT' : 'IN';
        
        savePlateData(detectedText, nextStatus, "Gate 1", true);
        
        // Display in UI
        if (plateTxt) plateTxt.innerText = detectedText;
        if (badge) {
            badge.textContent = nextStatus === 'IN' ? 'Access Granted (IN) ✅' : 'Access Granted (OUT) ✅';
            badge.style.background = nextStatus === 'IN' ? 'var(--success)' : '#fca321'; // matching style.css OUT color
        }
        if (resultBox) {
            resultBox.className = 'result-box valid success-flash';
            setTimeout(() => resultBox.classList.remove('success-flash'), 1000);
        }
        
        // Trigger Gate Animation
        openGate();
        
        console.log(`✅ Access granted for authorized vehicle (${nextStatus}):`, authResult.vehicleInfo);
    }
 else {
        // Access denied
        savePlateData(detectedText, "DENIED", "Gate 1", false);
        
        // Display in UI
        if (plateTxt) plateTxt.innerText = detectedText;
        if (badge) {
            badge.textContent = 'Access Denied ❌';
            badge.style.background = 'var(--danger)';
        }
        if (resultBox) {
            resultBox.className = 'result-box denied denied-flash';
            setTimeout(() => resultBox.classList.remove('denied-flash'), 1000);
        }
        
        // Don't open gate for unauthorized vehicles
        console.log('❌ Access denied for unauthorized vehicle');
    }
}

/**
 * Gate Control Logic
 */
function openGate() {
    const gateIcon = document.getElementById('gate-icon');
    const gateStatus = document.getElementById('gate-status');
    
    if (gateIcon && gateStatus) {
        gateIcon.classList.replace('gate-closed', 'gate-open');
        gateStatus.textContent = 'OPEN';
        gateStatus.style.color = 'var(--success)';

        // Auto close after 5 seconds
        setTimeout(() => {
            gateIcon.classList.replace('gate-open', 'gate-closed');
            gateStatus.textContent = 'CLOSED';
            gateStatus.style.color = '#fff';
        }, 5000);
    }
}

/**
 * Loads and logs all plates from the collection
 */
async function loadPlates() {
    try {
        const querySnapshot = await getDocs(platesRef);
        console.log("--- Loading Plates ---");
        querySnapshot.forEach((doc) => {
            console.log(doc.id, " => ", doc.data());
        });
    } catch (err) {
        console.error("Error loading plates:", err);
    }
}

// Global expose if needed for manual testing
window.loadPlates = loadPlates;

// ─── Real-time logs listener ───────────────────────────────────────────────────
function startLogsListener() {
    // Note: 'timestamp' is now an ISO string, sorting might require a field change if using serverTimestamp vs ISO string.
    // For ISO strings, it sorts lexicographically. 
    const q = query(platesRef, orderBy('timestamp', 'desc'));
    onSnapshot(q, (snapshot) => {
        allLogs = []; // Global copy for searching
        snapshot.forEach((doc) => {
            allLogs.push({ id: doc.id, ...doc.data() });
        });
        renderLogs(allLogs);
    }, (err) => console.error('Snapshot error:', err));
}

let allLogs = [];
const searchInput = document.getElementById('log-search');

function renderLogs(logs) {
    logTableBody.innerHTML = '';
    let total = 0, inCount = 0, outCount = 0;

    logs.forEach((data) => {
        total++;
        if((data.status || '').toUpperCase() === 'IN') inCount++;
        else if((data.status || '').toUpperCase() === 'OUT') outCount++;
        else if((data.status || '').toUpperCase() === 'DENIED') outCount++;

        const ts = data.timestamp ? data.timestamp.toDate() : new Date();
        const dateStr = ts.toLocaleDateString();
        const timeStr = ts.toLocaleTimeString();

        const tr = document.createElement('tr');
        const isAuth = data.isAuthorized || false;
        tr.innerHTML = `
            <td style="font-size: 1.1rem; color: #fff; font-weight: 600; min-width: 160px;">${data.plate}</td>

            <td><span class="status-${(data.status || '').toLowerCase()}">${data.status}</span></td>
            <td><span class="status-${isAuth ? 'auth' : 'unauth'}">${isAuth ? 'Authorized' : 'Unauthorized'}</span></td>
            <td>${dateStr}</td>
            <td>${timeStr}</td>

        `;
        logTableBody.appendChild(tr);
    });

    // Update stats UI
    const totalLogsEl = document.getElementById('total-logs');
    const inCountEl = document.getElementById('in-count');
    const outCountEl = document.getElementById('out-count');
    
    if(totalLogsEl) totalLogsEl.textContent = total;
    if(inCountEl) inCountEl.textContent = inCount;
    if(outCountEl) outCountEl.textContent = outCount;
}

searchInput?.addEventListener('input', (e) => {
    const term = e.target.value.toUpperCase();
    const filtered = allLogs.filter(log => 
        log.plate.toUpperCase().includes(term) || 
        log.status.toUpperCase().includes(term)
    );
    renderLogs(filtered);
});

startLogsListener();

// ─── ANPR State & Elements ────────────────────────────────────────────────────
let openCvReady = false;
let tesseractReady = false;
let ocrWorker = null;

let videoStream = null;
const videoElement = document.getElementById('video-element');
const imageElement = document.getElementById('image-element');
const btnCamera = document.getElementById('btn-camera');
const imgUpload = document.getElementById('img-upload');
const feedStatus = document.getElementById('feed-status');
const scanContainer = document.querySelector('.feed-container');

// Auto-scan state
let isAutoScanning = false;
let lastScannedPlate = "";
let lastScannedTime = 0;
const SCAN_COOLDOWN = 5000;
const AUTO_SCAN_INTERVAL = 1000;

// UI Result elements
const badge = document.getElementById('res-badge');
const plateTxt = document.getElementById('final-plate-txt');
const confidenceVal = document.getElementById('confidence-val');
const resultBox = document.getElementById('result-box');

// Manual entry
const manualInput = document.getElementById('manual-plate-input');
const accessTypeSelect = document.getElementById('access-type');
const btnSaveLog = document.getElementById('btn-save-log');
const logTableBody = document.getElementById('access-log-body');

// ─── Manual Save Connector ─────────────────────────────────────────────────────
btnSaveLog.addEventListener('click', async () => {
    let rawText = manualInput.value.trim().toUpperCase();
    if (!rawText) {
        alert("Please enter a plate number manually.");
        return;
    }
    if (rawText.length >= 9 && !rawText.includes(' ')) {
        const processed = processPlateText(rawText);
        rawText = processed.isValid ? processed.text : rawText;
    }
    
    // Check authorization for manual entry
    const authResult = await checkVehicleAuthorization(rawText);
    const manualType = accessTypeSelect.value.toUpperCase();
    const type = authResult.isAuthorized ? manualType : "DENIED";
    savePlateData(rawText, type, "Gate 1", authResult.isAuthorized);

    
    // Update UI based on authorization
    if (plateTxt) plateTxt.innerText = rawText;
    if (badge) {
        if (authResult.isAuthorized) {
            badge.textContent = `Access Granted (${type}) ✅`;
            badge.style.background = type === 'IN' ? 'var(--success)' : '#fca321';
        } else {
            badge.textContent = 'Access Denied ❌';
            badge.style.background = 'var(--danger)';
        }
    }
    if (resultBox) {
        resultBox.className = authResult.isAuthorized ? 'result-box valid success-flash' : 'result-box denied denied-flash';
        setTimeout(() => resultBox.classList.remove(authResult.isAuthorized ? 'success-flash' : 'denied-flash'), 1000);
    }

    
    if (authResult.isAuthorized) {
        openGate();
    }
    
    manualInput.value = '';
});

// ─── Video & Scanning Pipeline ────────────────────────────────────────────────
window.onOpenCvReadyActual = function() {
    openCvReady = true;
    checkServicesReady();
};

// Check if OpenCV is already ready (from the app.html loader)
if (window.openCvIsWaiting) {
    window.onOpenCvReadyActual();
}


async function initTesseract() {
    try {
        ocrWorker = await Tesseract.createWorker('eng', 1, {});
        tesseractReady = true;
        checkServicesReady();
    } catch(err) { console.error("OCR Error:", err); }
}

function checkServicesReady() {
    const bar = document.getElementById('progress-bar');
    const statusMsg = document.getElementById('loading-status');
    
    if (openCvReady && !tesseractReady) {
        if(bar) bar.style.width = '60%';
        if(statusMsg) statusMsg.textContent = 'Loading OCR Engine...';
    }

    if(openCvReady && tesseractReady) {
        hideLoader();
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if(loader) {
        const bar = document.getElementById('progress-bar');
        if(bar) bar.style.width = '100%';
        const statusMsg = document.getElementById('loading-status');
        if(statusMsg) statusMsg.textContent = 'System Ready!';
        
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }, 500);
    }
}

// Global fallback: Force hide loader after 8 seconds
setTimeout(() => {
    const loader = document.getElementById('loader');
    if(loader && loader.style.display !== 'none') {
        console.warn("Loader timed out - forcing display");
        hideLoader();
    }
}, 8000);

initTesseract();

btnCamera.addEventListener('click', async () => {
    try {
        if(videoStream) videoStream.getTracks().forEach(t => t.stop());
        imageElement.style.display = 'none';
        videoElement.style.display = 'block';
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 720 } });
        videoElement.srcObject = videoStream;
        videoElement.play();
        feedStatus.textContent = "Auto-Scanning Active";
        if (!isAutoScanning) { isAutoScanning = true; startAutoScanLoop(); }
    } catch (err) { alert("Camera not accessible."); }
});

imgUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(file) {
        if(videoStream) videoStream.getTracks().forEach(t => t.stop());
        videoElement.style.display = 'none';
        imageElement.style.display = 'block';
        const reader = new FileReader();
        reader.onload = (event) => {
            imageElement.src = event.target.result;
            feedStatus.textContent = "Auto-Scanning Image...";
            setTimeout(performCapture, 500);
        };
        reader.readAsDataURL(file);
    }
});

async function startAutoScanLoop() {
    while (isAutoScanning) {
        if (videoElement.style.display !== 'none' && videoElement.videoWidth > 0 && !videoElement.paused) {
            await performCapture();
        }
        await new Promise(resolve => setTimeout(resolve, AUTO_SCAN_INTERVAL));
    }
}

async function performCapture() {
    if(!openCvReady || !tesseractReady || !ocrWorker) {
        console.warn("Scanning skipped: Services not ready.", { openCvReady, tesseractReady, ocrWorker: !!ocrWorker });
        return;
    }

    const baseCanvas = document.createElement('canvas');
    if (videoElement.style.display !== 'none' && videoElement.videoWidth) {
        baseCanvas.width = videoElement.videoWidth; baseCanvas.height = videoElement.videoHeight;
        baseCanvas.getContext('2d').drawImage(videoElement, 0, 0);
    } else if (imageElement.style.display !== 'none' && imageElement.naturalWidth) {
        baseCanvas.width = imageElement.naturalWidth; baseCanvas.height = imageElement.naturalHeight;
        baseCanvas.getContext('2d').drawImage(imageElement, 0, 0);
    } else return;

    scanContainer.classList.add('scanning');
    console.log("--- Starting Capture ---");
    try {

        let src = cv.imread(baseCanvas);
        let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        let blur = new cv.Mat(); cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
        let edges = new cv.Mat(); cv.Canny(blur, edges, 50, 150);
        let contours = new cv.MatVector(); let hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
        let plateRect = null; let maxArea = 0;
        for (let i = 0; i < contours.size(); ++i) {
            let cnt = contours.get(i); let area = cv.contourArea(cnt);
            if (area > 1500) {
                let peri = cv.arcLength(cnt, true); let approx = new cv.Mat();
                cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
                if (approx.rows === 4) {
                    let rect = cv.boundingRect(cnt); let aspect = rect.width / rect.height;
                    if (aspect > 2 && aspect < 6 && area > maxArea) { maxArea = area; plateRect = rect; }
                }
                approx.delete();
            } cnt.delete();
        }
        console.log(`Contours found: ${contours.size()}, Best Plate Area: ${maxArea}`);

        const overlay = document.getElementById('overlay-canvas');
        overlay.width = baseCanvas.width; overlay.height = baseCanvas.height;
        const ctxO = overlay.getContext('2d'); ctxO.clearRect(0,0, overlay.width, overlay.height);
        let cropped;
        if (plateRect) {
            ctxO.strokeStyle = '#00ff88'; ctxO.lineWidth = 4; ctxO.strokeRect(plateRect.x, plateRect.y, plateRect.width, plateRect.height);
            cropped = src.roi(plateRect);
        } else {
            let rect = new cv.Rect(src.cols * 0.2, src.rows * 0.3, src.cols * 0.6, src.rows * 0.4);
            cropped = src.roi(rect);
        }
        let cropGray = new cv.Mat(); cv.cvtColor(cropped, cropGray, cv.COLOR_RGBA2GRAY, 0);
        let finalPrep = new cv.Mat(); cv.threshold(cropGray, finalPrep, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
        cv.imshow('canvas-crop', finalPrep);

        const cropCanvas = document.getElementById('canvas-crop');
        const { data: { text, confidence } } = await ocrWorker.recognize(cropCanvas);
        const finalResult = processPlateText(text);

        if (finalResult.isValid && confidence > 50) {
            const now = Date.now();
            if (finalResult.text !== lastScannedPlate || (now - lastScannedTime) > SCAN_COOLDOWN) {
                resultBox.className = 'result-box valid';
                badge.textContent = 'Auto-Detected ✅';
                if (confidenceVal) confidenceVal.textContent = `Confidence: ${Math.round(confidence)}%`;

                // Use the user's requested detection callback
                onPlateDetected(finalResult.text);

                lastScannedPlate = finalResult.text;
                lastScannedTime = now;
                resultBox.classList.add('success-flash');
                setTimeout(() => resultBox.classList.remove('success-flash'), 1000);
            }
        } else {
            console.log("Detection rejected:", { isValid: finalResult.isValid, confidence, text: finalResult.text });
        }

        src.delete(); gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete(); cropped.delete(); cropGray.delete(); finalPrep.delete();
    } catch (err) { console.error("Pipeline Error:", err); } finally { setTimeout(() => scanContainer.classList.remove('scanning'), 500); }
}

function processPlateText(rawText) {
    let cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length < 4) return { isValid: false, text: cleaned };
    
    // Try Indian format first
    let chars = cleaned.split('');
    const toAlpha = (c) => ({'0':'O','1':'I','2':'Z','4':'A','5':'S','8':'B','6':'G'}[c] || c);
    const toNum = (c) => ({'O':'0','I':'1','Z':'2','A':'4','S':'5','B':'8','G':'6','T':'7'}[c] || c);
    chars[0] = toAlpha(chars[0]); chars[1] = toAlpha(chars[1]);
    const len = chars.length;
    if (len >= 4) { for (let i = len - 4; i < len; i++) chars[i] = toNum(chars[i]); }
    if (len === 10) { chars[2] = toNum(chars[2]); chars[3] = toNum(chars[3]); chars[4] = toAlpha(chars[4]); chars[5] = toAlpha(chars[5]); }
    else if (len === 9) { chars[2] = toNum(chars[2]); chars[3] = toNum(chars[3]); chars[4] = toAlpha(chars[4]); }
    let joined = chars.join('');
    const plateRegex = /^[A-Z]{2}\d{1,2}[A-Z]{0,2}\d{4}$/;
    
    if (plateRegex.test(joined)) {
        let formatted = joined;
        if (joined.length === 10) formatted = `${joined.substring(0,2)} ${joined.substring(2,4)} ${joined.substring(4,6)} ${joined.substring(6)}`;
        else if (joined.length === 9) formatted = `${joined.substring(0,2)} ${joined.substring(2,4)} ${joined.substring(4,5)} ${joined.substring(5)}`;
        else if (joined.length === 8) formatted = `${joined.substring(0,2)} ${joined.substring(2,4)} ${joined.substring(4)}`;
        return { isValid: true, text: formatted };
    }
    
    // Try more flexible format (accept various international formats)
    const flexibleRegex = /^[A-Z0-9]{4,12}$/;
    if (flexibleRegex.test(cleaned)) {
        // Format with spaces for readability
        let formatted = cleaned;
        if (cleaned.length >= 7) {
            formatted = cleaned.substring(0, Math.ceil(cleaned.length/3)) + ' ' + 
                       cleaned.substring(Math.ceil(cleaned.length/3), Math.ceil(2*cleaned.length/3)) + ' ' + 
                       cleaned.substring(Math.ceil(2*cleaned.length/3));
        } else if (cleaned.length >= 5) {
            formatted = cleaned.substring(0, 2) + ' ' + cleaned.substring(2);
        }
        return { isValid: true, text: formatted };
    }
    
    return { isValid: false, text: cleaned };
}

// ─── Vehicle Management Functions ────────────────────────────────────────────────

/**
 * Opens the vehicle management modal
 */
function openVehicleModal() {
    const modal = document.getElementById('vehicle-modal');
    modal.style.display = 'block';
    loadAuthorizedVehicles();
}

/**
 * Closes the vehicle management modal
 */
function closeVehicleModal() {
    const modal = document.getElementById('vehicle-modal');
    modal.style.display = 'none';
}

/**
 * Loads all authorized vehicles from Firestore
 */
async function loadAuthorizedVehicles() {
    try {
        const querySnapshot = await getDocs(authorizedVehiclesRef);
        const tbody = document.getElementById('vehicles-table-body');
        tbody.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const vehicle = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${vehicle.plateNumber}</strong></td>
                <td>${vehicle.ownerName}</td>
                <td>${vehicle.vehicleType}</td>
                <td>${vehicle.department}</td>
                <td>
                    <button class="btn-delete" onclick="deleteVehicle('${doc.id}')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading authorized vehicles:', error);
    }
}

/**
 * Adds a new authorized vehicle to Firestore
 */
async function addAuthorizedVehicle(vehicleData) {
    try {
        console.log('Adding vehicle:', vehicleData);
        
        await addDoc(authorizedVehiclesRef, {
            plateNumber: vehicleData.plateNumber.toUpperCase(),
            ownerName: vehicleData.ownerName,
            vehicleType: vehicleData.vehicleType,
            department: vehicleData.department,
            createdAt: serverTimestamp()
        });
        console.log('✅ Vehicle added to authorized list');
        loadAuthorizedVehicles();
        
        // Clear form
        document.getElementById('add-vehicle-form').reset();
        
        alert('Vehicle added successfully!');
    } catch (error) {
        console.error('Error adding vehicle:', error);
        console.error('Error details:', error.code, error.message);
        alert('Error adding vehicle: ' + error.message);
    }
}

/**
 * Deletes an authorized vehicle from Firestore
 */
async function deleteVehicle(vehicleId) {
    if (confirm('Are you sure you want to remove this vehicle from the authorized list?')) {
        try {
            await deleteDoc(doc(db, AUTHORIZED_VEHICLES_COLLECTION, vehicleId));
            console.log('✅ Vehicle removed from authorized list');
            loadAuthorizedVehicles();
            alert('Vehicle removed successfully!');
        } catch (error) {
            console.error('Error deleting vehicle:', error);
            alert('Error removing vehicle. Please try again.');
        }
    }
}

// Make deleteVehicle globally accessible
window.deleteVehicle = deleteVehicle;

// ─── Event Listeners for Vehicle Management ─────────────────────────────────────

document.getElementById('btn-manage-vehicles')?.addEventListener('click', openVehicleModal);
document.getElementById('close-modal')?.addEventListener('click', closeVehicleModal);

document.getElementById('add-vehicle-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const vehicleData = {
        plateNumber: document.getElementById('new-plate').value.trim(),
        ownerName: document.getElementById('owner-name').value.trim(),
        vehicleType: document.getElementById('vehicle-type').value,
        department: document.getElementById('department').value.trim()
    };
    
    console.log('Form data collected:', vehicleData);
    
    // Validate plate number format
    const processed = processPlateText(vehicleData.plateNumber);
    console.log('Plate processing result:', processed);
    
    if (!processed.isValid) {
        alert('Invalid plate format. Please enter a valid license plate (4-12 characters, letters and numbers only). Examples: KA01AB1234, N82Y8388, ABC1234');
        return;
    }
    
    vehicleData.plateNumber = processed.text;
    console.log('Final vehicle data to add:', vehicleData);
    await addAuthorizedVehicle(vehicleData);
});

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('vehicle-modal');
    if (event.target === modal) {
        closeVehicleModal();
    }
});
