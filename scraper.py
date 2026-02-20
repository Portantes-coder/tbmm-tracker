import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime
import urllib.parse
import time

# --- CONFIGURATION ---
DATA_FILE = 'data.json'

# Define all the periods we want to scrape (Donem, Yasama Yili)
PERIODS = [
    (27, 1), (27, 2), (27, 3), (27, 4), (27, 5), (27, 6),
    (28, 1), (28, 2), (28, 3), (28, 4)
]

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

def load_data():
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"last_updated": "", "bills": {}, "mps": {}}

def save_data(data):
    data['last_updated'] = datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print("Database saved successfully.\n")

def scrape_tbmm():
    data = load_data()
    
    for donem, yasama_yili in PERIODS:
        master_url = f"https://www.tbmm.gov.tr/Tutanaklar/DoneminTutanakMetinleri?Donem={donem}&YasamaYili={yasama_yili}"
        print(f"--- Fetching master list for Dönem {donem}, Yasama Yılı {yasama_yili} ---")
        
        response = requests.get(master_url, headers=HEADERS)
        if response.status_code != 200:
            print(f"Failed to access TBMM master page for Dönem {donem}.")
            continue

        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 1. Find all "Açık Oylama Sonuçları" links
        oylama_links = []
        for a_tag in soup.find_all('a'):
            if a_tag.text and "Açık Oylama Sonuçları" in a_tag.text:
                link = a_tag.get('href')
                full_url = urllib.parse.urljoin("https://www.tbmm.gov.tr", link)
                oylama_links.append(full_url)

        print(f"Found {len(oylama_links)} voting sessions in this period. Processing...")

        # 2. Visit each voting page
        for link in oylama_links:
            process_voting_page(link, data)
            time.sleep(1) # Polite 1-second pause so we don't crash the government server

        # Save data after finishing each period so we don't lose progress
        save_data(data)

    print("ALL PERIODS COMPLETED SUCCESSFULLY!")

def process_voting_page(url, data):
    print(f"Scraping: {url}")
    response = requests.get(url, headers=HEADERS)
    if response.status_code != 200:
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # 3. Find all panels containing the bills and tables
    panels = soup.find_all('div', class_='panel')
    
    for panel in panels:
        # Get the Bill Title
        title_tag = panel.find('h3')
        if not title_tag:
            continue
        bill_title = title_tag.text.strip().replace(":", "")
        
        # Unique ID for the bill
        bill_id = str(hash(bill_title)) 

        if bill_id not in data['bills']:
            data['bills'][bill_id] = {
                "title": bill_title,
                "date": datetime.now().strftime("%Y-%m-%d") 
            }

        # 4. Find the detailed voting table
        table = panel.find('table', id='tblTbmmOylama')
        if not table:
            continue

        tbody = table.find('tbody')
        if not tbody:
            continue

        # 5. Extract MP votes row by row
        for row in tbody.find_all('tr'):
            cols = row.find_all('td')
            if len(cols) >= 7: 
                il = cols[0].text.strip()
                soyad = cols[1].text.strip()
                ad = cols[2].text.strip()
                parti = cols[3].text.strip()
                sonuc = cols[6].text.strip() 

                full_name = f"{ad} {soyad}".title()

                if full_name not in data['mps']:
                    data['mps'][full_name] = {
                        "name": full_name,
                        "party": parti,
                        "province": il.title(),
                        "votes": {}
                    }
                
                # Record the vote
                data['mps'][full_name]['votes'][bill_id] = sonuc

if __name__ == "__main__":
    # Feel free to delete your existing data.json again if you want a totally clean start!
    scrape_tbmm()