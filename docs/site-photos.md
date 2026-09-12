# Photos for the public site

Each picture on the home page is a row in `site_media`, uploaded from
**Back Office → الإعدادات → صور الموقع** (`/admin/settings/media`). A slot left empty renders a
brand-coloured drawing, so the layout never breaks (MED-01).

Wanted: real photographs of Tunisian groves. Until they exist, these prompts produce usable
stand-ins. **Anything generated is a stand-in, not a picture of an AgriZed property** — replace the
hero, coverage and parcel slots with real photographs before presenting projects to buyers, so no
visitor can read a generated scene as land AgriZed owns.

Sizes below are what the page asks for; upload at most 5 MB, JPG/PNG/WEBP/AVIF.

| Slot | Where it shows | Crop | Target width |
|---|---|---|---|
| `home.hero` | Full-width band behind the title | wide | 1600–2400 px |
| `home.journey` | Beside «المليون تبدأ بزيتونة» | 4/3 | 1200 px |
| `home.parcel_a/b/c` | The three example parcel cards | 4/3 | 1000 px |
| `home.coverage` | Beside the governorate list | 4/3 | 1200 px |
| `home.land` | Beside the landowner section | 3/2 | 1400 px |
| `home.closing` | Full-width band under the wordmark | 16/9 | 1600–2400 px |

Every prompt ends with the same guard: **no people, no text, no logos, no signage**. Text baked into
a picture cannot be translated or corrected, and faces would imply real customers.

## Prompts

**home.hero** — A wide, calm photograph of a Tunisian olive grove at golden hour. Rows of mature
olive trees with silver-green leaves on gently rolling reddish soil, low dry-stone wall, distant
hills, warm soft light. No people, no text, no logos. Photorealistic documentary photography,
ultra-wide landscape banner.

**home.journey** — A Tunisian olive grove in the middle of the day, seen from inside the rows: a
gnarled old trunk in the foreground, young trees behind it, dry terracotta earth, clear light.
No people, no text, no logos. Photorealistic, 4:3.

**home.parcel_a** — Aerial view straight down over a small olive plot in Tunisia, about a dozen
evenly spaced mature trees casting long shadows on red-brown soil. No people, no text, no logos.
Photorealistic drone photography, 4:3.

**home.parcel_b** — Aerial view over a young intensive olive plantation in Tunisia, dense regular
rows of small trees, irrigation lines visible, sandy soil. No people, no text, no logos.
Photorealistic drone photography, 4:3.

**home.parcel_c** — Aerial view over a larger productive olive grove in Tunisia at late afternoon,
wide spacing, mature canopies, a dirt track along one edge. No people, no text, no logos.
Photorealistic drone photography, 4:3.

**home.coverage** — A Tunisian rural landscape from a hilltop: olive groves stretching over low
hills toward the horizon, scattered fields, soft haze, early morning. No people, no text, no logos.
Photorealistic, 4:3.

**home.land** — A Tunisian olive farm seen from its edge: a field of mature olive trees behind a
simple wire fence, dry grass, a hint of a farm track. No people, no text, no logos. Photorealistic,
3:2.

**home.closing** — A single ancient olive tree alone on Tunisian ground at dusk, deep blue-green
tones, long shadows, calm and monumental. Room in the frame for a title over it. No people, no text,
no logos. Photorealistic, 16:9.

## What is in the slots today (2026-09-12)

Real photographs found through the Openverse API, all usable commercially. CC BY authors are
printed in the site footer automatically from `site_media.credit_text` / `credit_url`.

| Slot | Picture | Licence |
|---|---|---|
| `home.hero` | Lone olive tree in a field at Testour (Béja, Tunisia) — Smailtn, Wikimedia | CC0 |
| `home.journey` | Old trunks in the Amari valley grove — Miguel Virkkunen Carvalho, Flickr | CC BY 2.0 |
| `home.parcel_a` | Mature olive trees on bare soil, Illescas — MAMM Miguel Angel, Flickr | CC BY 2.0 |
| `home.parcel_b` | Intensive rows on a slope in autumn — maesejose, Flickr | CC BY 2.0 |
| `home.parcel_c` | Ancient dense grove, Corfu — Gareth1953, Flickr | CC BY 2.0 |
| `home.coverage` | Light over the olive plains of Sierra Mágina, Jaén — Flickr | CC0 |
| `home.land` | Olive trees behind a fence, hills behind — Monica Arellano-Ongpin, Flickr | CC BY 2.0 |
| `home.closing` | Young olive tree on golden grass under a storm sky — Aries Tottle, Flickr | CC BY 2.0 |

Only the hero is Tunisian; the rest are Mediterranean groves that read the same. Replace them with
AgriZed's own photographs of its groves as soon as those exist — clearing the credit with the picture.
The Flickr files are 1024 px wide: fine for cards, soft for a full-width band on a large screen.

## Alternative to generating them

Free photographs that can be used commercially: Unsplash, Pexels, Wikimedia Commons (check each
licence). Search for *olive grove Tunisia*, *oliveraie*, *Sfax olive trees*. A real Tunisian grove
beats a generated one for this project, and costs nothing.
