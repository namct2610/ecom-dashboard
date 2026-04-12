import sys
from camoufox.sync_api import Camoufox

def get_page_content(url):
    # Cấu hình để vượt tường lửa các trang TMĐT hoặc Crypto
    with Camoufox(headless=True, humanize=True) as browser:
        page = browser.new_page()
        page.goto(url, wait_until="networkidle")
        # Trả về nội dung đã render xong (bao gồm cả giá tiền chạy bằng JS)
        return page.content()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        url = sys.argv[1]
        print(get_page_content(url))
