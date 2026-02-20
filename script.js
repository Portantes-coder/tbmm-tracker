// ==========================================
// 1. GLOBAL VARIABLES & DOM ELEMENTS
// ==========================================
let votingData = {};
let contactData = {};
let allMPs = [];

const mapDiv = document.getElementById('parliament-map');
const searchInput = document.getElementById('searchInput');
const provinceFilter = document.getElementById('provinceFilter');
const modal = document.getElementById('mp-modal');
const closeModal = document.getElementById('closeModal');

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

// Cleans messy government text encoding and specific typos
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

// Normalizes text for the search bar (ignores cases and Turkish characters)
function makeSearchable(text) {
    if (!text) return "";
    return text.toLocaleLowerCase('tr')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/i̇/g, 'i'); // Crucial fix for the uppercase İ bug
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
    
    // Fixed: Now Yeni Yol and Yeniden Refah won't get confused
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
// 3. DATA LOADING & MERGING
// ==========================================
Promise.all([
    fetch('data.json').then(res => res.json()),
    fetch('contacts.json').then(res => res.json())
]).then(([votes, contacts]) => {
    votingData = votes;
    contactData = contacts;
    allMPs = [];

    // A. Use the Contact List as the Master List (Removes ghosts, sets current parties)
    for (const [contactName, contactInfo] of Object.entries(contactData)) {
        let mergedVotes = {};
        const cleanContactName = cleanTurkishText(contactName).toLowerCase();

        // Fish through the messy voting data to find all matches (catching typos & clones)
        for (const [voteName, voteInfo] of Object.entries(votingData.mps)) {
            if (cleanTurkishText(voteName).toLowerCase() === cleanContactName) {
                mergedVotes = { ...mergedVotes, ...voteInfo.votes };
            }
        }

        // Build the perfectly clean MP profile
        allMPs.push({
            name: contactName,
            party: contactInfo.party,       
            province: contactInfo.province, 
            votes: mergedVotes,             
            contact: contactInfo
        });
    }

    // B. Sort MPs based on physical TBMM Seating Order (Left to Right)
    const partySeatingOrder = {
        "tip": 1, 
        "dbp": 2, 
        "emep": 3, 
        "dem": 4, 
        "chp": 5, 
        "dsp": 6, 
        "iyi": 7, 
        "dp": 8, 
        "deva": 9, 
        "gelecek": 10, 
        "akp": 11, 
        "mhp": 12, 
        "yeniyol": 13, 
        "saadet": 14, 
        "hudapar": 15, 
        "yrp": 16, 
        "bagimsiz": 17
    };

    allMPs.sort((a, b) => {
        const orderA = partySeatingOrder[getPartyClass(a.party)] || 99;
        const orderB = partySeatingOrder[getPartyClass(b.party)] || 99;
        
        if (orderA === orderB) {
            // If in the same party, sort alphabetically by name
            return cleanTurkishText(a.name).localeCompare(cleanTurkishText(b.name), 'tr');
        }
        return orderA - orderB;
    });

    console.log(`Successfully loaded and merged ${allMPs.length} active MPs!`);

    // C. Initialize the User Interface
    populateProvinceFilter();
    drawParliament(allMPs);
});

// ==========================================
// 4. DRAWING THE PARLIAMENT
// ==========================================
// ==========================================
// 4. DRAWING THE PARLIAMENT (PIE SLICES)
// ==========================================
function drawParliament(mpsToDraw) {
    mapDiv.innerHTML = ''; 
    
    const totalSeats = mpsToDraw.length;
    const rows = 12; 
    const maxRadius = 380; 
    const minRadius = 100; 
    
    const centerX = mapDiv.offsetWidth / 2;
    const centerY = 420; 

    // Step 1: Generate all the empty seat coordinates first
    let seatCoords = [];
    let seatsGenerated = 0;

    for (let r = 0; r < rows; r++) {
        const radius = minRadius + (r * ((maxRadius - minRadius) / (rows - 1)));
        const fractionOfTotal = radius / ((maxRadius + minRadius) * rows / 2);
        let seatsInRow = Math.round(totalSeats * fractionOfTotal);
        
        // Ensure the last row perfectly makes up the exact total number of MPs
        if (r === rows - 1) {
            seatsInRow = totalSeats - seatsGenerated; 
        }

        for (let s = 0; s < seatsInRow; s++) {
            // Angle goes from PI (Left) to 0 (Right)
            const angle = Math.PI - (s / (seatsInRow - 1)) * Math.PI;
            const x = centerX + (radius * Math.cos(angle)); 
            const y = centerY - (radius * Math.sin(angle));
            
            seatCoords.push({ x, y, angle, radius });
        }
        seatsGenerated += seatsInRow;
    }

    // Step 2: Sort the empty seats by Angle (Left to Right)
    seatCoords.sort((a, b) => {
        // If angles are different, sort by angle (Left to Right)
        if (Math.abs(b.angle - a.angle) > 0.0001) {
            return b.angle - a.angle; 
        }
        // If they are on the exact same angle, sort inner-to-outer
        return a.radius - b.radius; 
    });

    // Step 3: Put the MPs into the sorted seats!
    // Because mpsToDraw is already sorted Left-to-Right by party,
    // they will perfectly form "pie slices" in the sorted seats.
    for (let i = 0; i < totalSeats; i++) {
        const mp = mpsToDraw[i];
        const seat = seatCoords[i];

        const seatEl = document.createElement('div');
        seatEl.className = `seat ${getPartyClass(mp.party)}`;
        seatEl.style.left = `${seat.x}px`;
        seatEl.style.top = `${seat.y}px`;
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
    document.getElementById('modal-name').innerText = cleanTurkishText(mp.name);
    document.getElementById('modal-party-province').innerText = `${cleanTurkishText(mp.party)} - ${cleanTurkishText(mp.province)}`;
    
    const contact = mp.contact || {};
    
    // Set the Image! (Use a default if they don't have one)
    const defaultImage = "https://cdn.tbmm.gov.tr/TBMMWeb/resim/mv_resim_default.png";
    document.getElementById('modal-image').src = contact.image_url || defaultImage;

    document.getElementById('modal-email').innerText = contact.email || "Bilinmiyor";
    document.getElementById('modal-phone').innerText = (contact.telephones && contact.telephones.length > 0) ? contact.telephones.join(", ") : "Bilinmiyor";
    document.getElementById('modal-address').innerText = contact.address || "Bilinmiyor";

    const votesList = document.getElementById('modal-votes');
    votesList.innerHTML = ''; 
    
    for (const [billId, voteResult] of Object.entries(mp.votes)) {
        const billInfo = votingData.bills[billId];
        if (!billInfo) continue; 

        const li = document.createElement('li');
        
        let voteClass = "vote-katilmadi";
        const cleanVote = cleanTurkishText(voteResult).toLowerCase();
        if (cleanVote.includes("kabul")) voteClass = "vote-kabul";
        if (cleanVote.includes("ret")) voteClass = "vote-ret";

        let cleanBillTitle = cleanTurkishText(billInfo.title);
        let shortTitle = cleanBillTitle.substring(0, 45) + "...";

        // Create a smart search link targeted ONLY to the TBMM domain
        const exactSearchTerm = `"${cleanBillTitle}"`;
        const searchUrl = `https://www.tbmm.gov.tr/Arama/Sonuc?q=${encodeURIComponent(exactSearchTerm)}`;
        // We wrap the shortTitle in an anchor tag (<a>) to make it clickable
        li.innerHTML = `
            <a href="${searchUrl}" target="_blank" style="text-decoration: none; color: #0056b3; font-weight: 500;" title="${cleanBillTitle}">
                ${shortTitle}
            </a> 
            <span class="${voteClass}">${cleanTurkishText(voteResult)}</span>
        `;
        votesList.appendChild(li);
    }

    modal.classList.remove('hidden');
}

// Close Modal Events
closeModal.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

// ==========================================
// 6. FILTERING & SEARCH LOGIC
// ==========================================
function populateProvinceFilter() {
    const provinces = [...new Set(allMPs.map(mp => cleanTurkishText(mp.province)))];
    
    // Proper Turkish Alphabetical Sort
    provinces.sort((a, b) => a.localeCompare(b, 'tr'));
    
    provinces.forEach(prov => {
        const option = document.createElement('option');
        option.value = prov;
        option.innerText = prov;
        provinceFilter.appendChild(option);
    });
}

function filterSeats() {
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

searchInput.addEventListener('input', filterSeats);
provinceFilter.addEventListener('change', filterSeats);