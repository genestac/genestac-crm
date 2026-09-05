import re

_PURCHASE_KEYWORDS = [
    "payment link", "link bhej", "link send", "link share", "link do",
    "invoice", "bill send", "proforma",
    "khareed", "buy ", "purchase",
    "pay kar", "abhi le",
]
_AFFIRM_KEYWORDS = [
    "haa", "haan", "ha ", "ha,", "ha.", " yes", "ok ", "ok,", "ok.", "okay",
    "theek hai", "theek", "bilkul", "proceed", "kar do", "kardo", "kar dijiye",
    "bhej do", "bhejdo", "bhejo", "send karo", "send", "pls send", "please send",
    "chahiye", "dedo", "de do", "done", "yep", "yeah", "fine", "sahi",
]
_AFFIRM_EXACT = {"ok", "okay", "k", "yes", "haan", "ha", "haa", "theek", "sure", "bilkul", "proceed", "done", "fine", "sahi", "send", "bhejo", "kardo", "bhejdo"}

for message in ["lekin me pehle mounjaro ka 5mg leta tha", "accha mujhe wegovy lena hai", "me pehle mounjaro ka 5mg leta tha kya 2.5mg lena abhi shi hoga ?"]:
    _msg_clean = message.lower().strip()
    _msg_words = set(re.findall(r'[a-zA-Z]+', _msg_clean))
    _msg_pad = " " + _msg_clean + " "
    
    _wants_purchase = [kw for kw in _PURCHASE_KEYWORDS if kw in _msg_pad]
    _is_affirm_exact = _msg_words & _AFFIRM_EXACT
    _is_affirm_kw = [kw for kw in _AFFIRM_KEYWORDS if kw in _msg_pad]
    
    print(f"MSG: {message}")
    print(f"  wants_purchase: {_wants_purchase}")
    print(f"  is_affirm_exact: {_is_affirm_exact}")
    print(f"  is_affirm_kw: {_is_affirm_kw}")
