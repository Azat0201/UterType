import json
import re
import requests
from random import randint, choice

def get_random_internet_text_json():
    headers = {
        "User-Agent": "TypingTrainerApp/1.0 (contact: admin@example.com)"
    }

    # 1. ПОПЫТКА: Википедия без интро (берем тело статьи)
    try:
        wiki_url = "https://ru.wikipedia.org/w/api.php"
        wiki_params = {
            "action": "query",
            "format": "json",
            "generator": "random",
            "grnnamespace": 0,
            "prop": "extracts",
            "explaintext": True,   # Чистый текст без HTML
            # Убираем "exintro": True, чтобы получить глубокий текст статьи
        }
        response = requests.get(wiki_url, params=wiki_params, headers=headers, timeout=4)
        if response.status_code == 200:
            pages = response.json().get("query", {}).get("pages", {})
            for _, page_data in pages.items():
                full_text = page_data.get("extract", "").strip()
                
                if full_text:
                    # 1. Удаляем заголовки Википедии вида == Заголовок == или === Подзаголовок ===
                    full_text = re.sub(r'==+.*?==+', '', full_text)
                    
                    # 2. Аккуратно делим оставшийся чистый текст на предложения
                    sentences = re.split(r'(?<=[.!?])\s+', full_text)
                    
                    # Очищаем от пустых строк, слишком коротких обрубков и мусора
                    sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
                    
                    # Проверяем, что предложений достаточно
                    if len(sentences) > 3:
                        # Выбрасываем первое предложение (оно часто техническое)
                        clean_sentences = sentences[1:]
                        
                        # Выбираем случайное число предложений (от 3 до 7)
                        count = randint(3, 7)
                        
                        # Берем последовательный связный кусок из середины текста
                        max_start_idx = max(0, len(clean_sentences) - count)
                        start_idx = randint(0, max_start_idx)
                        result_sentences = clean_sentences[start_idx : start_idx + count]
                        
                        final_text = " ".join(result_sentences)
                        
                        # Финальная очистка от сносок, [2] и лишних пробелов
                        final_text = re.sub(r'\[\d+\]', '', final_text)  
                        final_text = re.sub(r'\s+', ' ', final_text).strip()
                        
                        if len(final_text) > 20:
                            return final_text
    except Exception as e:
        print(f"Ошибка Википедии: {e}")

    try:
        fish_url = "https://fish-text.ru/get"
        fish_params = {
            "type": "paragraph", 
            "number": 2, 
            "format": "json"
        }
        response = requests.get(fish_url, params=fish_params, headers=headers, timeout=4)
        if response.status_code == 200:
            text = response.json().get("text", "").strip()
            sentences = re.split(r'(?<=[.!?])\s+', text)
            sentences = [s.strip() for s in sentences if s.strip()]
            
            count = randint(3, 7)
            final_text = " ".join(sentences[:count])
            return final_text
    except Exception as e:
        print(f"Ошибка FishText: {e}")

    return "Каждый уважающий себя программист должен уметь быстро и без ошибок набирать исходный код в терминале."
