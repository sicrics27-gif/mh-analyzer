"""AOB9 타워(아케이드 화면) 방 그림 만들기 — 제미나이 그림 모델. 결과: pwa/lib/tower/<방>.webp, result.json
고객 정보는 전혀 쓰지 않습니다 (가상의 사무실 그림만)."""
import base64, io, json, os, sys, urllib.request, urllib.error
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "art" / "tower"
API = "https://generativelanguage.googleapis.com/v1beta"
STYLE = ("Photorealistic high quality 3D architectural visualization render, cross-section cutaway of ONE single room inside a luxury high-rise office tower, "
         "seen straight from the front like a dollhouse with the front wall removed, camera at eye level slightly above, symmetric framing, the room fills the whole image, "
         "dark navy walls or rich walnut wood, brushed gold accents, warm indirect cove lighting, soft realistic shadows, night time, cinematic, ultra detailed, "
         "people are small elegant full-body Korean office workers in tailored business attire (not celebrities), no text, no letters, no logos, no watermark. Room: ")
ROOMS = {
 "game": "an executive trophy lounge: backlit glass display cabinet with golden trophies and award plaques on the back wall, a burgundy leather Chesterfield sofa, brass floor lamp, one man in a navy suit admiring a trophy",
 "plan": "a strategy room: a large glass whiteboard on the back wall covered with colorful schedule bars and sticky notes, a long walnut meeting table, a woman in a burgundy suit presenting and a man in a navy suit listening",
 "map": "a control room: a huge curved dark screen on the back wall showing a glowing blue city map with route lines and location pins, a console desk with two monitors, one operator wearing a headset seated",
 "cust": "a client management office: a large executive walnut desk with an iMac-style monitor, tall bookshelves full of binders, a window showing Seoul night skyline, a man in a navy suit working at the desk",
 "new": "a private consultation room: a round white marble table with two chairs, a planner in a navy suit and a client couple talking over documents and coffee, an abstract painting on the wall, a pendant lamp, a plant",
 "call": "a premium call center: two workstations separated by glass partitions, each with monitors, two staff wearing headsets speaking on calls, blue accent light strip on the wall",
 "contact": "a communication desk: an elegant desk with a laptop, a smartphone and a desk phone, a woman in a burgundy blazer typing messages, floating soft glowing chat bubble icons, window to city night view",
 "reg": "a registration records room: walls of light grey metal filing cabinets, a marble service counter, a woman in a navy suit organizing folders",
 "md": "a luxury product showroom: illuminated display shelves with elegant boxed products under spotlights, a glass display pedestal in the center, a man in a black suit presenting",
 "sug": "a grand marble lobby with reception desk and a receptionist, a polished red suggestion box on a stand, brass details, a visitor walking in",
 "backup": "a bank vault room: a huge round polished steel vault door with golden locking wheel on the back wall, stacks of gold bars, dramatic lighting",
 "conn": "a modern server room: rows of black server racks with blinking green and amber LEDs, blue ambient glow, cable trays, one engineer checking a tablet",
}
EXTRA = {
 "roof": ("Photorealistic 3D render, the rooftop of a luxury high-rise office tower at night in Seoul, front view, a sleek rooftop garden with small trees and a glass railing, "
          "Seoul city night skyline with Namsan tower in the background, stars and moon, cinematic navy and gold lighting, empty space in the center top for a sign, no text, no letters, no logos", "16:9"),
}
def req(url, body=None):
    key = os.environ["GEMINI_API_KEY"].strip()
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers={"content-type": "application/json", "x-goog-api-key": key})
    with urllib.request.urlopen(r, timeout=240) as f:
        return json.loads(f.read().decode())
def save(name, b64):
    from PIL import Image
    im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    w = 1600 if name == "roof" else 1024
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(OUT / f"{name}.webp", "WEBP", quality=82, method=6)
    return im.size
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    only = [x for x in (os.environ.get("ONLY") or "").split(",") if x]
    res = {}
    try:
        models = [m["name"] for m in req(f"{API}/models?pageSize=200").get("models", []) if "image" in m["name"] and "generateContent" in m.get("supportedGenerationMethods", [])]
    except Exception as e:
        models = []; res["list_error"] = str(e)[:300]
    models.sort(key=lambda m: (("pro" not in m), ("preview" in m)))  # 품질 좋은 모델 먼저
    res["models"] = models
    jobs = {k: (STYLE + v, "4:3") for k, v in ROOMS.items()}; jobs.update(EXTRA)
    for name, (prompt, ar) in jobs.items():
        if only and name not in only: continue
        res[name] = "모델 없음"
        for m in models:
            try:
                j = req(f"{API}/{m}:generateContent", {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"], "imageConfig": {"aspectRatio": ar}}})
                parts = (j.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
                img = next((p["inlineData"]["data"] for p in parts if p.get("inlineData")), None)
                if img: res[name] = f"성공 ({m}) {save(name, img)}"; break
                res[name] = f"{m}: 그림 없음"
            except urllib.error.HTTPError as e:
                res[name] = f"{m}: HTTP {e.code} {e.read().decode(errors='replace')[:200]}"
            except Exception as e:
                res[name] = f"{m}: {str(e)[:150]}"
    (OUT / "result.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=1))
if __name__ == "__main__":
    main()
