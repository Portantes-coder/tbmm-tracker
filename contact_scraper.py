import requests
from bs4 import BeautifulSoup
import json
import time

# --- CONFIGURATION ---
CONTACTS_FILE = 'contacts.json'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

PHONE_URL = "https://www.tbmm.gov.tr/milletvekili/telefon-liste"
EMAIL_URL = "https://www.tbmm.gov.tr/milletvekili/eposta-liste"
BASE_URL = "https://www.tbmm.gov.tr"

def normalize_name(name):
    replacements = {'İ': 'i', 'I': 'i', 'ı': 'i', 'i': 'i', 'Ş': 's', 'ş': 's', 'Ç': 'c', 'ç': 'c', 'Ğ': 'g', 'ğ': 'g', 'Ü': 'u', 'ü': 'u', 'Ö': 'o', 'ö': 'o'}
    name = name.lower()
    for tr, en in replacements.items():
        name = name.replace(tr, en)
    return name.replace(" ", "")

def format_numbers(cell_html):
    numbers = []
    raw_lines = cell_html.stripped_strings
    for line in raw_lines:
        clean_num = line.strip()
        if len(clean_num) >= 7:
            numbers.append(f"+90 312 {clean_num}")
    return numbers

def scrape_contacts():
    contacts_data = {}

    print("Fetching Phone numbers, Addresses, and Image Links... (This will take a few minutes)")
    resp_phone = requests.get(PHONE_URL, headers=HEADERS)
    if resp_phone.status_code == 200:
        soup = BeautifulSoup(resp_phone.text, 'html.parser')
        tbody = soup.find('table', id='mecTable').find('tbody')
        
        rows = tbody.find_all('tr')
        total_mps = len(rows)
        
        for index, row in enumerate(rows):
            cols = row.find_all('td')
            if len(cols) >= 6:
                il = cols[0].text.strip()
                mp_name = cols[1].text.strip()
                parti = cols[2].text.strip()
                address = cols[3].text.strip()
                telephones = format_numbers(cols[4])
                faxes = format_numbers(cols[5])
                
                # --- NEW: GRAB THE IMAGE URL ---
                image_url = ""
                onclick_attr = cols[1].get('onclick', '')
                if "redirectDetay" in onclick_attr:
                    # Extract the relative URL (e.g., '/milletvekili/MilletvekiliDetay?Id=...')
                    rel_url = onclick_attr.split("'")[1]
                    detail_page_url = BASE_URL + rel_url
                    
                    # Visit the detail page
                    try:
                        detail_resp = requests.get(detail_page_url, headers=HEADERS)
                        detail_soup = BeautifulSoup(detail_resp.text, 'html.parser')
                        img_tag = detail_soup.find('img', class_='profile-image')
                        if img_tag and img_tag.has_attr('src'):
                            image_url = img_tag['src']
                    except Exception as e:
                        print(f"Failed to fetch image for {mp_name}")
                    
                    # Be polite to the server so we don't get banned
                    time.sleep(0.2) 
                
                print(f"[{index+1}/{total_mps}] Processed: {mp_name.title()}")

                contacts_data[mp_name] = {
                    "name": mp_name.title(),
                    "province": il.title(),
                    "party": parti,
                    "address": address,
                    "telephones": telephones,
                    "faxes": faxes,
                    "email": "", 
                    "image_url": image_url # Save the image!
                }
    else:
        print("Failed to load the Phone list page.")

    print("\nFetching E-mail addresses...")
    resp_email = requests.get(EMAIL_URL, headers=HEADERS)
    if resp_email.status_code == 200:
        soup = BeautifulSoup(resp_email.text, 'html.parser')
        tbody = soup.find('table', id='mecTable').find('tbody')
        
        for row in tbody.find_all('tr'):
            cols = row.find_all('td')
            if len(cols) >= 4:
                scraped_name = cols[0].text.strip()
                email = cols[3].text.strip()
                
                normalized_scraped = normalize_name(scraped_name)
                for key_name in contacts_data.keys():
                    if normalize_name(key_name) == normalized_scraped:
                        contacts_data[key_name]['email'] = email
                        break

    with open(CONTACTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(contacts_data, f, ensure_ascii=False, indent=4)
    
    print(f"\nSuccess! Saved contacts with images to {CONTACTS_FILE}.")

if __name__ == "__main__":
    scrape_contacts()