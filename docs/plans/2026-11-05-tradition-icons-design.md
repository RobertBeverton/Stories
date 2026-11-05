# Tradition icons

Date: 2026-11-05

## Problem

The icon set had five entries (`sun`, `boat`, `berry`, `shell`, `cloud`), adapted from an early mockup. Legend Lane has 38 stories across about 22 traditions, and its icons were handed out at random (Thor, Hermes and Nuwa all `cloud`; Shiva, Bast and Anansi all `shell`). An icon told the reader nothing about the story.

## Decision

Add one emblem per tradition, so a story's icon says which tradition it comes from. Not one per god: that is 38 and growing, and every new story would need a new drawing.

- Each story keeps its own `icon:` front matter line. No build logic parses `gods:` (that field is world canon, and some entries such as "All the gods so far" do not fit a tradition).
- The original five stay valid. Isles of Yum and Bramble Wall keep using them, and so do the world tiles.
- No contract change: `library.schema.json` accepts any non-empty icon string. The allowed names are `ICON_NAMES` in `site/assets/js/icons.mjs`, checked by `validate-content` and `world-data`.

## The set

| Name | Tradition | Emblem |
|---|---|---|
| `greek` | Greek | Fluted column |
| `norse` | Norse | Hammer and bolt |
| `hindu` | Hindu | Lotus |
| `egyptian` | Egyptian | Eye of Horus |
| `chinese` | Chinese | Flaming pearl |
| `japanese` | Japanese | Torii gate |
| `roman` | Roman | Arch with keystone |
| `slavic` | Slavic | Hut on chicken legs |
| `mesoamerican` | Mesoamerican | Quetzal feather |
| `pacific` | Polynesian and Hawaiian | Fish hook over waves |
| `north-american` | Native American, Haida and Tlingit | Thunderbird totem |
| `west-african` | West African and Yoruba | Spider web |
| `andean` | Andean | Chakana (stepped cross) |
| `korean` | Korean | Bear paw |
| `persian` | Persian | Winged bird (Simurgh) |
| `finnish` | Finnish | Kantele |
| `canaanite` | Canaanite | Bull horns and bolt |
| `gathering` | Stories with every tradition (the summer fair) | Bunting |

Each is a two-path drawing in the existing 120 by 82 box: `main` (bold, filled at 26% by CSS) and `detail` (thin). Covers, Media Session artwork and the generated PNGs use them with no other change.

## Legend Lane mapping

Greek: Pandora, Prometheus, Persephone, Hermes, Hephaestus, Pan, Athena. Norse: Thor, Loki, Idun. Hindu: Shiva, Hanuman, Lakshmi. Egyptian: Thoth, Anubis, Bast. Chinese: Yu the Great, Nuwa (both stories). Japanese: Seven Lucky Gods, Amaterasu. Roman: Felicitas, Janus. Slavic: Baba Yaga, Father Frost. Mesoamerican: Quetzalcoatl. Pacific: Maui, Pele. North American: Coyote, Raven. West African: Anansi, Oshun. Andean: Pachamama. Korean: Hwanung and Ungnyeo. Persian: Simurgh. Finnish: Vainamoinen. Canaanite: Hadad. Gathering: the summer fair.

The mapping is applied in the `Gods-PrimarySchool` repo (separate commit), not here.

## Checks

- `scripts/icons.test.mjs`: every name is unique, kebab-case, and has a non-empty main and detail path; the original five and the 18 new names are all present.
- Existing `validate-content` and contrast checks run unchanged.
- A contact sheet (all icons on the story accent colours) is rendered for review by eye before shipping.
