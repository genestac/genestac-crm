import json
import urllib.request

url = "http://localhost:8000/api/sales/orders"
req = urllib.request.Request(url, headers={'Authorization': 'Bearer '})
try:
    pass # we can't auth easily.
except Exception as e:
    pass
