// ==========================================
// 1. GLOBAL VARIABLES & DOM ELEMENTS
// ==========================================
let votingData = {};
let contactData = {};
let allMPs = [];
let partyMajorityPerBill = {}; 

const mapDiv = document.getElementById('parliament-map');
const searchInput = document.getElementById('searchInput');
const provinceFilter = document.getElementById('provinceFilter');
const modal = document.getElementById('mp-modal');
const closeModal = document.getElementById('closeModal');
const exportPartyFilter = document.getElementById('exportPartyFilter');
const exportProvinceFilter = document.getElementById('exportProvinceFilter');
const colEmail = document.getElementById('colEmail');
const colPhone = document.getElementById('colPhone');
const colAddress = document.getElementById('colAddress');
const downloadCsvBtn = document.getElementById('downloadCsvBtn');

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
function cleanTurkishText(text) {
    if (!text) return "";
    const txt = document.createElement("textarea");
    txt.innerHTML = text;
    let decoded = txt.value;
    
    return decoded
        .replace(/ý/g, 'ı').replace(/þ/g, 'ş').replace(/ð/g, 'ğ')
        .replace(/Ý/g, 'İ').replace(/Þ/g, 'Ş').replace(/Ð/g, 'Ğ')
        .replace(/Ã¼/g, 'ü').replace(/Ã§/g, 'ç').replace(/Ã¶/g, 'ö')
        .replace(/Ãœ/g, 'Ü').replace(/Ã‡/g, 'Ç').replace(/Ã–/g, 'Ö')
        .replace(/ÇEKÝMSER/g, 'ÇEKİMSER'); 
}

function makeSearchable(text) {
    if (!text) return "";
    return text.toLocaleLowerCase('tr')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/i̇/g, 'i'); 
}

function doNamesMatch(name1, name2) {
    const clean1 = makeSearchable(cleanTurkishText(name1));
    const clean2 = makeSearchable(cleanTurkishText(name2));

    const n1 = clean1.replace(/\s+/g, ' ').trim().split(' ');
    const n2 = clean2.replace(/\s+/g, ' ').trim().split(' ');

    if (n1.join('') === n2.join('')) return true;

    const shorter = n1.length < n2.length ? n1 : n2;
    const longer = n1.length < n2.length ? n2 : n1;

    if (shorter.length >= 2) {
        const allMatch = shorter.every(part => longer.includes(part));
        if (allMatch) return true;
    }
    return false;
}

function getPartyClass(partyName) {
    const p = makeSearchable(cleanTurkishText(partyName)); 
    if (p.includes("ak parti") || p.includes("adalet ve kalkinma")) return "akp";
    if (p.includes("chp") || p.includes("cumhuriyet halk")) return "chp";
    if (p.includes("mhp") || p.includes("milliyetci hareket")) return "mhp";
    if (p.includes("dem parti") || p.includes("esitlik ve demokrasi") || p.includes("yesiller")) return "dem";
    if (p.includes("iyi")) return "iyi"; 
    if (p.includes("saadet")) return "saadet";
    if (p.includes("gelecek")) return "gelecek";
    if (p.includes("deva") || p.includes("atilim")) return "deva";
    if (p.includes("yeni yol")) return "yeniyol"; 
    if (p.includes("yeniden refah")) return "yrp"; 
    if (p.includes("turkiye isci") || p.includes("tip")) return "tip";
    if (p.includes("hur dava") || p.includes("huda")) return "hudapar";
    if (p.includes("demokrat parti") || p.includes("dp")) return "dp";
    if (p.includes("emek partisi") || p.includes("emep")) return "emep";
    if (p.includes("demokratik bolgeler") || p.includes("dbp")) return "dbp";
    if (p.includes("demokratik sol") || p.includes("dsp")) return "dsp";
    return "bagimsiz"; 
}

// ==========================================
// 3. DATA LOADING & INITIALIZATION
// ==========================================
Promise.all([
    fetch('data.json').then(res => res.json()),
    fetch('contacts.json').then(res => res.json())
]).then(([votes, contacts]) => {
    votingData = votes;
    contactData = contacts;
    allMPs = [];

    // Master List merging
    for (const [contactName, contactInfo] of Object.entries(contactData)) {
        let mergedVotes = {};
        for (const [voteName, voteInfo] of Object.entries(votingData.mps)) {
            if (doNamesMatch(contactName, voteName)) {
                mergedVotes = { ...mergedVotes, ...voteInfo.votes };
            }
        }
        allMPs.push({
            name: contactName,
            party: contactInfo.party,       
            province: contactInfo.province, 
            votes: mergedVotes,             
            contact: contactInfo
        });
    }

    const partySeatingOrder = {
        "tip": 1, "dbp": 2, "emep": 3, "dem": 4, 
        "chp": 5, "dsp": 6, "iyi": 7, "dp": 8, 
        "deva": 9, "gelecek": 10, "akp": 11, "mhp": 12, 
        "yeniyol": 13, "saadet": 14, "hudapar": 15, "yrp": 16, 
        "bagimsiz": 17
    };

    allMPs.sort((a, b) => {
        const orderA = partySeatingOrder[getPartyClass(a.party)] || 99;
        const orderB = partySeatingOrder[getPartyClass(b.party)] || 99;
        if (orderA === orderB) return cleanTurkishText(a.name).localeCompare(cleanTurkishText(b.name), 'tr');
        return orderA - orderB;
    });

    // --- CALCULATE PARTY MAJORITIES ---
    partyMajorityPerBill = {};
    for (const billId of Object.keys(votingData.bills)) {
        partyMajorityPerBill[billId] = {};
        const partyVotes = {}; 

        allMPs.forEach(mp => {
            const partyClass = getPartyClass(mp.party);
            const rawVote = mp.votes[billId];
            if (!rawVote) return;

            const cleanVote = cleanTurkishText(rawVote).toLowerCase();
            let voteType = "katilmadi";
            if (cleanVote.includes("kabul")) voteType = "kabul";
            else if (cleanVote.includes("ret") || cleanVote.includes("red")) voteType = "ret";
            else if (cleanVote.includes("çekimser") || cleanVote.includes("cekimser")) voteType = "cekimser";

            if (voteType !== "katilmadi") {
                if (!partyVotes[partyClass]) partyVotes[partyClass] = {};
                partyVotes[partyClass][voteType] = (partyVotes[partyClass][voteType] || 0) + 1;
            }
        });

        for (const party in partyVotes) {
            let maxVote = null;
            let maxCount = -1;
            for (const v in partyVotes[party]) {
                if (partyVotes[party][v] > maxCount) {
                    maxCount = partyVotes[party][v];
                    maxVote = v;
                }
            }
            partyMajorityPerBill[billId][party] = maxVote;
        }
    }

    // --- NEW: CALCULATE OVERALL PARTY STATS FOR SIDEBAR ---
    const partyDissentStats = {};
    allMPs.forEach(mp => {
        const partyClass = getPartyClass(mp.party);
        if (partyClass === 'bagimsiz') return;

        if (!partyDissentStats[partyClass]) {
            partyDissentStats[partyClass] = { total: 0, dissent: 0, rawName: cleanTurkishText(mp.party) };
        }

        for (const billId of Object.keys(votingData.bills)) {
            const rawVote = mp.votes[billId];
            if (!rawVote) continue;

            let voteType = "katilmadi";
            const cleanVote = cleanTurkishText(rawVote).toLowerCase();
            if (cleanVote.includes("kabul")) voteType = "kabul";
            else if (cleanVote.includes("ret") || cleanVote.includes("red")) voteType = "ret";
            else if (cleanVote.includes("çekimser") || cleanVote.includes("cekimser")) voteType = "cekimser";

            if (voteType !== "katilmadi") {
                const majority = partyMajorityPerBill[billId] ? partyMajorityPerBill[billId][partyClass] : null;
                if (majority) {
                    partyDissentStats[partyClass].total++;
                    if (voteType !== majority) {
                        partyDissentStats[partyClass].dissent++;
                    }
                }
            }
        }
    });

    const partyStatsList = document.getElementById('party-stats-list');
    if (partyStatsList) {
        const statsArray = Object.keys(partyDissentStats).map(key => {
            const data = partyDissentStats[key];
            const percent = data.total === 0 ? 0 : (data.dissent / data.total) * 100;
            return { partyClass: key, name: data.rawName, percent: percent, total: data.total };
        }).filter(stat => stat.total > 0); 

        statsArray.sort((a, b) => b.percent - a.percent);

        statsArray.forEach(stat => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 14px; height: 14px; border-radius: 50%;" class="${stat.partyClass}"></div>
                    ${stat.name}
                </span>
                <span class="stat-badge">%${stat.percent.toFixed(1)}</span>
            `;
            partyStatsList.appendChild(li);
        });
    }

    // Setup UI with Fail-Safes
    populateProvinceFilter();
    populateExportFilters();
    drawParliament(allMPs);

    // Deep Link & Intro Check
    const hash = window.location.hash;
    if (hash && hash.startsWith('#mp=')) {
        const targetMpSlug = hash.replace('#mp=', '');
        const targetMp = allMPs.find(m => makeSearchable(m.name).replace(/\s+/g, '-') === targetMpSlug);
        if (targetMp) showModal(targetMp); 
    } else {
        try {
            if (!localStorage.getItem('tbmmIntroSeen')) {
                const intro = document.getElementById('intro-modal');
                if (intro) intro.classList.remove('hidden');
            }
        } catch (e) {
            const intro = document.getElementById('intro-modal');
            if (intro) intro.classList.remove('hidden');
        }
    }
}).catch(error => {
    console.error("Data Load Error:", error);
});

// --- Intro Modal Logic ---
const closeIntroBtn = document.getElementById('closeIntroBtn');
if (closeIntroBtn) {
    closeIntroBtn.addEventListener('click', () => {
        const intro = document.getElementById('intro-modal');
        if (intro) intro.classList.add('hidden');
        try {
            localStorage.setItem('tbmmIntroSeen', 'true');
        } catch (e) {
            // Silently fail if local storage is restricted
        }
    });
}

// ==========================================
// 4. DRAWING THE PARLIAMENT
// ==========================================
function drawParliament(mpsToDraw) {
    if (!mapDiv) return; // Fail-safe
    
    mapDiv.innerHTML = ''; 
    
    const totalSeats = mpsToDraw.length;
    const rows = 12; 
    
    let containerWidth = mapDiv.clientWidth || 800;
    if (containerWidth > window.innerWidth) {
        containerWidth = window.innerWidth - 20; 
    }
    
    const maxRadius = (containerWidth / 2) - 15; 
    const minRadius = maxRadius * 0.26; 
    
    const centerX = containerWidth / 2;
    const centerY = maxRadius + 30; 
    
    mapDiv.style.height = `${centerY + 10}px`;
    const seatSize = containerWidth < 500 ? 6 : 10;

    let seatCoords = [];
    let seatsGenerated = 0;

    for (let r = 0; r < rows; r++) {
        const radius = minRadius + (r * ((maxRadius - minRadius) / (rows - 1)));
        const fractionOfTotal = radius / ((maxRadius + minRadius) * rows / 2);
        let seatsInRow = Math.round(totalSeats * fractionOfTotal);
        
        if (r === rows - 1) {
            seatsInRow = totalSeats - seatsGenerated; 
        }

        for (let s = 0; s < seatsInRow; s++) {
            const angle = Math.PI - (s / (seatsInRow - 1)) * Math.PI;
            const x = centerX + (radius * Math.cos(angle)); 
            const y = centerY - (radius * Math.sin(angle));
            seatCoords.push({ x, y, angle, radius });
        }
        seatsGenerated += seatsInRow;
    }

    seatCoords.sort((a, b) => {
        if (Math.abs(b.angle - a.angle) > 0.0001) return b.angle - a.angle; 
        return a.radius - b.radius; 
    });

    for (let i = 0; i < totalSeats; i++) {
        const mp = mpsToDraw[i];
        const seat = seatCoords[i];

        const seatEl = document.createElement('div');
        seatEl.className = `seat ${getPartyClass(mp.party)}`;
        
        seatEl.style.left = `${seat.x}px`;
        seatEl.style.top = `${seat.y}px`;
        seatEl.style.width = `${seatSize}px`;
        seatEl.style.height = `${seatSize}px`;
        
        seatEl.title = `${cleanTurkishText(mp.name)} (${cleanTurkishText(mp.party)})`;
        seatEl.dataset.name = mp.name;
        seatEl.dataset.province = mp.province;
        
        seatEl.addEventListener('click', () => showModal(mp));
        mapDiv.appendChild(seatEl);
    }
}

// ==========================================
// 5. MODAL (POPUP) LOGIC
// ==========================================
function showModal(mp) {
    if (!modal) return; // Fail-safe
    
    let validBillsForMp = 0; 
    let attendedCount = 0;
    let differentFromPartyCount = 0;
    let validPartyVotes = 0;
    const mpPartyClass = getPartyClass(mp.party);

    for (const billId of Object.keys(votingData.bills)) {
        const rawVote = mp.votes[billId];
        
        if (rawVote === undefined) continue; 
        
        validBillsForMp++; 

        let voteType = "katilmadi";
        const cleanVote = cleanTurkishText(rawVote).toLowerCase();
        
        if (cleanVote.includes("kabul")) voteType = "kabul";
        else if (cleanVote.includes("ret") || cleanVote.includes("red")) voteType = "ret";
        else if (cleanVote.includes("çekimser") || cleanVote.includes("cekimser")) voteType = "cekimser";

        if (voteType !== "katilmadi") {
            attendedCount++;
            
            if (mpPartyClass !== "bagimsiz") {
                const partyMajority = partyMajorityPerBill[billId] ? partyMajorityPerBill[billId][mpPartyClass] : null;
                if (partyMajority && voteType !== partyMajority) {
                    differentFromPartyCount++;
                }
                if (partyMajority) {
                    validPartyVotes++;
                }
            }
        }
    }

    const attendanceRate = validBillsForMp === 0 ? 0 : Math.round((attendedCount / validBillsForMp) * 100);
    const dissentRate = validPartyVotes === 0 ? 0 : Math.round((differentFromPartyCount / validPartyVotes) * 100);

    const statAtt = document.getElementById('stat-attendance');
    if (statAtt) statAtt.innerText = `%${attendanceRate}`;
    
    const dissentCont = document.getElementById('stat-dissent-container');
    const statDissent = document.getElementById('stat-dissent');
    if (dissentCont && statDissent) {
        if (mpPartyClass === "bagimsiz") {
            dissentCont.style.display = 'none';
        } else {
            dissentCont.style.display = 'block';
            statDissent.innerText = `%${dissentRate}`;
        }
    }

    window.history.pushState(null, null, `#mp=${makeSearchable(mp.name).replace(/\s+/g, '-')}`);

    const mName = document.getElementById('modal-name');
    if (mName) mName.innerText = cleanTurkishText(mp.name);
    
    const mPartyProv = document.getElementById('modal-party-province');
    if (mPartyProv) mPartyProv.innerText = `${cleanTurkishText(mp.party)} - ${cleanTurkishText(mp.province)}`;
    
    const contact = mp.contact || {};
    const defaultImage = "https://cdn.tbmm.gov.tr/TBMMWeb/resim/mv_resim_default.png";
    const mImage = document.getElementById('modal-image');
    if (mImage) mImage.src = contact.image_url || defaultImage;

    const mEmail = document.getElementById('modal-email');
    if (mEmail) mEmail.innerText = contact.email || "Bilinmiyor";
    
    const mPhone = document.getElementById('modal-phone');
    if (mPhone) mPhone.innerText = (contact.telephones && contact.telephones.length > 0) ? contact.telephones.join(", ") : "Bilinmiyor";
    
    const mAddress = document.getElementById('modal-address');
    if (mAddress) mAddress.innerText = contact.address || "Bilinmiyor";

    const currentUrl = encodeURIComponent(window.location.href);
    const shareText = encodeURIComponent(`${cleanTurkishText(mp.name)}'nin TBMM oylama geçmişini ve iletişim bilgilerini inceleyin: `);
    
    const btnWhatsapp = document.getElementById('btn-whatsapp');
    const btnTwitter = document.getElementById('btn-twitter');
    if (btnWhatsapp) btnWhatsapp.onclick = () => window.open(`https://api.whatsapp.com/send?text=${shareText}${currentUrl}`);
    if (btnTwitter) btnTwitter.onclick = () => window.open(`https://twitter.com/intent/tweet?text=${shareText}&url=${currentUrl}`);

    const votesList = document.getElementById('modal-votes');
    if (votesList) {
        votesList.innerHTML = ''; 
        
        for (const [billId, voteResult] of Object.entries(mp.votes)) {
            const billInfo = votingData.bills[billId];
            if (!billInfo) continue; 

            const li = document.createElement('li');
            let voteClass = "vote-katilmadi";
            let displayVoteText = "Katılmadı"; 

            const cleanVote = cleanTurkishText(voteResult).toLowerCase();
            
            if (cleanVote.includes("kabul")) {
                voteClass = "vote-kabul";
                displayVoteText = "Kabul";
            } else if (cleanVote.includes("ret") || cleanVote.includes("red")) {
                voteClass = "vote-ret";
                displayVoteText = "Ret";
            } else if (cleanVote.includes("çekimser") || cleanVote.includes("cekimser")) {
                voteClass = "vote-cekimser";
                displayVoteText = "Çekimser";
            }

            let cleanBillTitle = cleanTurkishText(billInfo.title);
            let shortTitle = cleanBillTitle.substring(0, 45) + "...";

            const exactSearchTerm = `"${cleanBillTitle}"`;
            const searchUrl = `https://www.tbmm.gov.tr/Arama/Sonuc?q=${encodeURIComponent(exactSearchTerm)}`;
            
            li.innerHTML = `
                <a href="${searchUrl}" target="_blank" style="text-decoration: none; color: #0056b3; font-weight: 500;" title="${cleanBillTitle}">
                    ${shortTitle}
                </a> 
                <span class="${voteClass}">${displayVoteText}</span>
            `;
            votesList.appendChild(li); 
        }
    }

    modal.classList.remove('hidden');
}

function closeAndClearModal() {
    if (modal) modal.classList.add('hidden');
    window.history.pushState(null, null, ' '); 
}

if (closeModal) closeModal.addEventListener('click', closeAndClearModal);
if (modal) {
    modal.addEventListener('click', (e) => { 
        if (e.target === modal) closeAndClearModal(); 
    });
}

// ==========================================
// 6. FILTERING, EXPORT, RESIZE LOGIC
// ==========================================
function populateProvinceFilter() {
    if (!provinceFilter) return; // Fail-safe
    const provinces = [...new Set(allMPs.map(mp => cleanTurkishText(mp.province)))].sort((a, b) => a.localeCompare(b, 'tr'));
    provinces.forEach(prov => {
        const option = document.createElement('option');
        option.value = prov;
        option.innerText = prov;
        provinceFilter.appendChild(option);
    });
}

function filterSeats() {
    if (!searchInput || !provinceFilter) return; // Fail-safe
    const searchTerm = makeSearchable(searchInput.value); 
    const selectedProv = provinceFilter.value;
    const allSeatElements = document.querySelectorAll('.seat');

    allSeatElements.forEach(seat => {
        const normalizedSeatName = makeSearchable(seat.dataset.name);
        const matchesName = normalizedSeatName.includes(searchTerm);
        const matchesProv = selectedProv === "all" || cleanTurkishText(seat.dataset.province) === selectedProv;
        
        if (matchesName && matchesProv) {
            seat.classList.remove('faded');
            seat.style.pointerEvents = 'auto'; 
        } else {
            seat.classList.add('faded');
            seat.style.pointerEvents = 'none'; 
        }
    });
}

if (searchInput) searchInput.addEventListener('input', filterSeats);
if (provinceFilter) provinceFilter.addEventListener('change', filterSeats);

function populateExportFilters() {
    if (!exportProvinceFilter || !exportPartyFilter) return; // Fail-safe
    const provinces = [...new Set(allMPs.map(mp => cleanTurkishText(mp.province)))].sort((a, b) => a.localeCompare(b, 'tr'));
    provinces.forEach(prov => {
        const option = document.createElement('option'); option.value = prov; option.innerText = prov;
        exportProvinceFilter.appendChild(option);
    });

    const parties = [...new Set(allMPs.map(mp => cleanTurkishText(mp.party)))].sort((a, b) => a.localeCompare(b, 'tr'));
    parties.forEach(party => {
        const option = document.createElement('option'); option.value = party; option.innerText = party;
        exportPartyFilter.appendChild(option);
    });
}

function escapeCSV(text) {
    if (!text) return '""';
    return `"${String(text).replace(/"/g, '""')}"`;
}

if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', () => {
        const selectedParties = Array.from(exportPartyFilter.selectedOptions).map(opt => opt.value);
        const selectedProvinces = Array.from(exportProvinceFilter.selectedOptions).map(opt => opt.value);

        const mpsToExport = allMPs.filter(mp => {
            const partyMatch = selectedParties.length === 0 || selectedParties.includes(cleanTurkishText(mp.party));
            const provMatch = selectedProvinces.length === 0 || selectedProvinces.includes(cleanTurkishText(mp.province));
            return partyMatch && provMatch;
        });

        if (mpsToExport.length === 0) return alert("Seçtiğiniz filtrelere uygun milletvekili bulunamadı.");

        let headers = ["İsim", "Parti", "İl"];
        if (colEmail && colEmail.checked) headers.push("E-posta");
        if (colPhone && colPhone.checked) { headers.push("Telefon 1"); headers.push("Telefon 2"); }
        if (colAddress && colAddress.checked) headers.push("Adres");

        let csvContent = headers.join(",") + "\r\n";

        mpsToExport.forEach(mp => {
            const contact = mp.contact || {};
            let row = [ escapeCSV(cleanTurkishText(mp.name)), escapeCSV(cleanTurkishText(mp.party)), escapeCSV(cleanTurkishText(mp.province)) ];

            if (colEmail && colEmail.checked) row.push(escapeCSV(contact.email || ""));
            if (colPhone && colPhone.checked) {
                row.push(escapeCSV((contact.telephones && contact.telephones.length > 0) ? contact.telephones[0] : ""));
                row.push(escapeCSV((contact.telephones && contact.telephones.length > 1) ? contact.telephones[1] : ""));
            }
            if (colAddress && colAddress.checked) row.push(escapeCSV(contact.address || ""));

            csvContent += row.join(",") + "\r\n";
        });

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "tbmm_iletisim_bilgileri.csv";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
}

// ==========================================
// 7. MOBILE RESIZE LISTENER (OPTIMIZED)
// ==========================================
let resizeTimer;
let lastWindowWidth = window.innerWidth; 

window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const currentWidth = window.innerWidth;
        
        if (currentWidth !== lastWindowWidth) {
            lastWindowWidth = currentWidth;
            
            if (allMPs.length > 0) { 
                drawParliament(allMPs); 
                filterSeats(); 
            }
        }
    }, 250);
});
