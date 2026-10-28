// Identifies trading cards in a photo of one binder page (a grid of clear
// plastic pockets, one card each). Holds the Anthropic API key server-side —
// this must never end up in the client bundle. Set it with:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Deploy from the repo root with:
//   supabase functions deploy scan-binder-page
//
// Requires being signed in with the shared login on the client side — Edge
// Functions verify the caller's JWT by default, and supabaseClient.functions
// .invoke() automatically attaches the current session's token.

// Scoped to an allowlist rather than "*" — this function requires a valid
// session JWT, so a wildcard origin would let any site's JS call it on
// behalf of a signed-in user's browser if a token ever leaked (e.g. via an
// unrelated XSS elsewhere). localhost stays allowed for dev/preview testing
// against the same deployed function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://supportbgp.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

// The exact-match list above only ever matched `localhost` — testing via
// `npm run dev -- --host` (needed to reach the dev server from a phone on
// the same LAN) serves from a private-IP origin instead, which silently
// failed CORS on that phone while the same call worked fine from a laptop's
// `localhost` origin. Matches any RFC1918 private range on Vite's dev/preview
// ports, not a specific IP, since that address varies by network.
const DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(5173|4173)$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || DEV_ORIGIN_RE.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const CARD_GAMES = [
  "Magic", "Pokemon", "Yugioh", "Lorcana", "One Piece",
  "Sports Singles", "SWU", "Riftbound", "Gundam", "Other",
];

const DETECT_CARDS_TOOL = {
  name: "report_detected_cards",
  description: "Reports every trading card detected in the binder page photo.",
  input_schema: {
    type: "object",
    properties: {
      cards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            position: { type: "string", description: "Rough grid position, e.g. 'row1-col2' — top-left is row1-col1" },
            name: { type: "string", description: "Card name as printed" },
            game: { type: "string", enum: CARD_GAMES },
            set: {
              type: "string",
              description: "The SPECIFIC printed set/expansion name if you can identify it, else an empty string. For Pokemon especially: prefer the specific expansion (e.g. 'Paldean Fates', 'Obsidian Flames', 'Ascended Heroes') over the general era/block — 'Scarlet & Violet' alone is too vague if a more specific name is legible near the set symbol/collector number at the bottom of the card. Only fall back to the era name if the specific expansion truly isn't legible. For One Piece specifically, an expansion NAME is rarely printed on the card itself — report the set-code prefix instead, from the same bottom-right code the number field reads (e.g. 'OP01' from 'OP01-001', or 'ST01' from a starter-deck card 'ST01-001') — this is what actually narrows a search for this game, same role a full expansion name plays for the others. For Lorcana, no expansion name is printed on the card at all — only a bare SET NUMBER (e.g. '6' for Azurite Sea), printed in the small bottom-left text next to the collector number. Report that number as the set value. For Riftbound, likewise no expansion name is printed — report the short set-letters code instead (e.g. 'OGN' for Origins), from the same bottom code the number field reads. For Gundam, same again — no expansion name is printed, only the short set-letters code (e.g. 'GD01' for Newtype Rising), from the same code the number field reads.",
            },
            number: {
              type: "string",
              description: "The printed collector number for this exact print. Else an empty string if not legible. This is one of the strongest signals for telling apart same-name prints (a card can have many alternate-art/rarity versions with the same name, and — for a serialized card specifically — even physically distinct one-of-one copies), so look closely for it even if you're unsure of the set or rarity. LOCATION VARIES BY GAME: for Pokemon, it's typically near the set symbol at the bottom of the card, e.g. '280' or '280/217' if a total-count denominator is shown. For Magic, it's NOT near the set symbol (which sits on the type line instead) — it's in the small text along the bottom-left corner of the card, usually alongside a one-letter rarity code and a language code, e.g. a card printed '0744 LTR • EN' has collector number '0744' (keep any leading zeros exactly as printed). For Yu-Gi-Oh, it's the full printed set code in the bottom-left corner, e.g. 'LOB-005' or 'SDY-006' — report it exactly as printed, including the letters and hyphen (this is a global unique key across every Yu-Gi-Oh set, not just a bare number). For One Piece, the card's full code (set letters + number, e.g. 'OP01-001' or 'ST01-001') is printed together in the BOTTOM-RIGHT corner, right next to the rarity letter code (e.g. 'OP01-121 SEC') — report just the number portion after the dash (e.g. '001', '121'), not the set-code prefix (that belongs in the set field below). For Lorcana, it's in the small bottom-left text alongside the set number and language code, in the same 'this card / total in set' format as Pokemon, e.g. '154/204' — report it exactly as shown, denominator included if present. For Riftbound, it's at the bottom of the card as a set-code-plus-number combo followed by a total, e.g. 'OGN-310/298' — report just the number portion (e.g. '310'), not the set-code prefix (that belongs in the set field above) or the total. For Gundam, the collector number is printed alongside the rarity letter code (e.g. 'GD01-001', typically near the top-right of the card, unlike most other games above) — report just the number portion after the dash (e.g. '001'), not the set-code prefix. Keep any leading zeros exactly as printed. Used only to narrow an image search, never saved as-is.",
            },
            rarity: {
              type: "string",
              description: "Rarity — determine this PRIMARILY from the card's overall visual layout/border " +
                "treatment, not by trying to read tiny printed rarity text/symbols, which are often too small " +
                "or blurry to trust in an ordinary binder-page photo. A photo good enough to identify the card " +
                "at all is usually good enough to judge its overall visual style. Report EXACTLY one of the " +
                "values below (they match this game's real rarity database) based on which visual description " +
                "fits, or an empty string if none clearly apply. " +
                "FOR MAGIC: rarity is shown by the small expansion/set symbol's COLOR, printed on the right " +
                "edge of the type line (the line naming the card's type, directly above the rules text box) — " +
                "not by overall art style the way Pokemon works below. Report exactly one of: 'Common' (a " +
                "black or white symbol — also report 'Common' for a basic land, which prints no symbol at " +
                "all), 'Uncommon' (a silver symbol), 'Rare' (a gold symbol), 'Mythic Rare' (a red-orange " +
                "symbol — this tier didn't exist before 2008, so a pre-2008-looking card can never be this), " +
                "'Special' (a purple symbol — used only on Time Spiral's 'timeshifted' cards, extremely rare " +
                "to see at all), or 'Bonus' (a glowing/prismatic version of the mythic symbol, used on bonus- " +
                "sheet cards like Vintage Masters' Power Nine — also extremely rare). Leave this blank if the " +
                "symbol's color genuinely isn't legible in the photo rather than guessing from the card's " +
                "power level, price, or how good it looks — none of those indicate rarity. " +
                "FOR YU-GI-OH: judge from WHERE the foil/holo treatment appears, not overall art style. " +
                "'Common' = no foil anywhere, plain printed name and art. " +
                "'Rare' = ONLY the card's name is foil/holographic; the artwork itself is flat, non-foil. " +
                "'Super Rare' = the opposite: ONLY the artwork is foil/holographic; the name is plain flat " +
                "text. " +
                "'Ultra Rare' = BOTH the name AND the artwork are foil/holographic. " +
                "'Ultimate Rare' = same foil coverage as Ultra Rare, PLUS the art/name/border has a raised, " +
                "3D-embossed texture visible at an angle — look for a relief/textured surface, not just flat " +
                "foil shine. " +
                "'Secret Rare' = a diagonal-line rainbow/prismatic holographic pattern over the card's name " +
                "(often the art too), distinct from Ultra Rare's plainer foil. " +
                "'Gold Rare' = the card's name is printed in a solid gold-colored foil (not rainbow/silver). " +
                "'Ghost Rare' = the art has a pale, washed-out, almost-translucent silvery-holographic look " +
                "quite different from every rarity above — described as 'ghostly'. " +
                "Only report 'Platinum Secret Rare', 'Prismatic Secret Rare', \"Collector's Rare\", " +
                "'Starlight Rare', or 'Quarter Century Secret Rare' if a printed rarity marker or an unmistakable " +
                "full-card rainbow/holographic treatment covering the ENTIRE card front (border included, not " +
                "just name/art) is clearly visible — these several tiers look similar to each other in a " +
                "binder-page photo and are easy to misidentify, so leave this field blank rather than guess " +
                "between them if the photo isn't clearly good enough to be confident. " +
                "FOR POKEMON: it has used two rarity-naming systems by " +
                "era — use whichever era the card's overall art style/set matches: " +
                "MODERN cards (2023-present, Scarlet & Violet era, 'ex' lowercase suffix): " +
                "'Double Rare' = normal small boxed artwork (NOT full art) for an 'ex' Pokemon, with an all-over " +
                "foil/holo sheen across the whole card face, not just over the art window. " +
                "'Illustration Rare' = artwork covers the card's ENTIRE front edge-to-edge with no colored info " +
                "box left at all, plus a holographic border line around the very edge; usually a non-'ex' " +
                "Pokemon or a Trainer/Supporter card. " +
                "'Ultra Rare' = the same full-bleed edge-to-edge treatment as Illustration Rare, but for an " +
                "'ex' Pokemon. (Word order: 'Ultra Rare' — Ultra comes first. See the CAUTION note below — " +
                "this is easy to mix up with the older era's differently-ordered 'Rare Ultra'.) " +
                "'Special Illustration Rare' = the same full-bleed edge-to-edge art, PLUS a visible extra " +
                "sparkle/glitter-foil texture over the whole card (often a wider, multi-element scene); for an " +
                "'ex' Pokemon or a Trainer/Supporter card. " +
                "'Hyper Rare' = the card's entire border/background is a gold-toned holographic finish " +
                "replacing the normal color scheme — a distinctly gold, 'gilded' looking card. " +
                "MEGA EVOLUTION era (2025-present, 'Mega ___ ex' Pokemon — check this BEFORE the plain modern " +
                "rules above, since it overrides them for Mega Pokemon specifically): " +
                "'Mega Attack Rare' = the printed attack name itself is written in Japanese katakana script " +
                "instead of English, even though the rest of the card (HP, rules text, flavor text) is in " +
                "English — a distinctive, easy-to-spot swap that's the real tell for this rarity regardless of " +
                "how full-art or bordered the rest of the card looks. " +
                "'Mega Hyper Rare' = the same all-gold border/background treatment described for 'Hyper Rare' " +
                "above, but for a 'Mega ___ ex' Pokemon specifically — use this name instead of 'Hyper Rare' " +
                "whenever the gold-bordered card is a Mega Pokemon. " +
                "OLDER cards (roughly 2012-2022, '-EX'/'-GX'/'V' suffix, uppercase): " +
                "'Rare Holo' = normal small boxed artwork with a holographic sheen over just the art. " +
                "'Rare Holo EX' / 'Rare Holo GX' / 'Rare Holo V' = normal card frame for an EX/GX/V-suffixed " +
                "Pokemon, but the illustration typically breaks past the frame's edge (the Pokemon visually " +
                "overlapping the border) instead of staying boxed inside a small window, plus a holo sheen. " +
                "'Rare Ultra' = full-art version of the same EX/GX/V Pokemon — artwork extends well past the " +
                "normal small window, though a colored bar remains where the attack text sits (bottom-only for " +
                "EX-era cards; thin bars top AND bottom for GX/V-era cards). (Word order: 'Rare Ultra' — Rare " +
                "comes first — the opposite order from the modern era's 'Ultra Rare' above. See the CAUTION " +
                "note below.) " +
                "'Rare Secret' = the same full-art extent as Rare Ultra, but with a gold-toned holographic " +
                "border/background replacing the normal frame colors, and/or a collector number higher than " +
                "the set's listed total (e.g. '105' printed in a set whose total is '100'). " +
                "ANY era, plain non-foil card with a standard small-boxed border and none of the above visual " +
                "traits: 'Common' / 'Uncommon' / 'Rare' — these three genuinely cannot be told apart by look " +
                "alone; only report one if a tiny rarity symbol next to the collector number is actually " +
                "legible, otherwise leave this field blank rather than guessing. If the card instead carries " +
                "a black star symbol (or otherwise reads as a promotional release, e.g. no regular numbered-" +
                "set collector number, just a standalone promo number), report 'Promo' regardless of the " +
                "visual traits above. " +
                "CAUTION: 'Ultra Rare' (modern) and 'Rare Ultra' (older) describe the same visual treatment " +
                "in two different eras and are NOT interchangeable — they are the same two words in opposite " +
                "order, which is easy to transpose by mistake. Before answering either one, re-check which " +
                "word comes first: modern full-art 'ex' card → 'Ultra Rare' (Ultra first); older full-art " +
                "EX/GX/V card → 'Rare Ultra' (Rare first). " +
                "IMPORTANT: never report a Pokemon card's type/subtype printed in its name area — 'ex', 'EX', " +
                "'GX', 'V', 'VMAX', and 'VSTAR' are card subtypes, not rarities, even though they're a required " +
                "clue for several of the values above (e.g. telling 'Illustration Rare' apart from 'Ultra " +
                "Rare' requires noticing the 'ex' suffix in the name). " +
                "FOR ONE PIECE: unlike the other games above, don't guess from visual style at all — a short " +
                "letter code is printed directly next to the collector number in the card's BOTTOM-RIGHT " +
                "corner (e.g. 'OP01-121 SEC' — the code after the number is the rarity). Read that exact code " +
                "and report the matching full name: 'C' = 'Common', 'UC' = 'Uncommon', 'R' = 'Rare', " +
                "'SR' = 'Super Rare', 'SEC' = 'Secret Rare', 'L' = 'Leader' (every Leader card, regardless of " +
                "how common it otherwise looks, since Leader is its own tier), 'SP' = 'Special Rare', " +
                "'TR' = 'Treasure Rare', 'MR' = 'Manga Rare' (an alternate-art Secret Rare styled after an " +
                "Oda manga panel — report 'Manga Rare' specifically, not 'Secret Rare', if you can tell). If a " +
                "small star (✶) appears just above this letter code, the card is a parallel/alternate-art " +
                "version of whichever base rarity is printed — the star does NOT change which rarity value you " +
                "report; it only means this exact card is also a parallel print (there's no separate field for " +
                "that yet, so it's fine to leave unrecorded here). Leave rarity blank if the code genuinely " +
                "isn't legible rather than guessing from the art or how good the card looks. " +
                "FOR LORCANA: a small shape symbol is printed at the bottom of the card, next to the " +
                "collector number — read its SHAPE (not color first) and report exactly one of: 'Common' (a " +
                "plain filled circle), 'Uncommon' (a book icon — the one exception to the shape-based " +
                "size/rarity pattern below), 'Rare' (a triangle), 'Super Rare' (a diamond), 'Legendary' (a " +
                "pentagon), or 'Enchanted' (a six-sided/hexagon shape, always with an unmistakable rainbow or " +
                "holographic finish covering the whole card — this is the rarest tier and looks distinctly " +
                "different from the other five, never plain foil like a Super Rare or Legendary can be). If " +
                "the card instead comes from an unnumbered promotional card (no 's:<number>'-style set marker, " +
                "often handed out at events or store exclusives) rather than a normal numbered set, report " +
                "'Promo' regardless of what shape appears. Leave this blank if the symbol's shape genuinely " +
                "isn't legible rather than guessing from the card's power level or how good it looks. " +
                "FOR STAR WARS: UNLIMITED (SWU): read the small gemstone/star symbol near the bottom of the " +
                "card, next to the collector number. Report exactly one of: 'Common' (a grey or clear " +
                "gemstone), 'Uncommon' (a green gemstone), 'Rare' (a blue gemstone), or 'Legendary' (a gold " +
                "or yellow STAR shape — not a gemstone, the one shape break in this pattern). Leave this " +
                "blank rather than guess if the symbol's color/shape isn't legible, and also leave it blank " +
                "for a card that doesn't clearly match one of those four looks (e.g. a suspected 'Special' " +
                "rarity slot card) — that fifth tier has no confirmed distinct visual marker to go by, so " +
                "guessing at it would be worse than leaving it for staff to set by hand. A premium foil/art " +
                "treatment (Hyperspace, Showcase, Prestige) does NOT change which of the four values above to " +
                "report — those are a separate treatment layered on top of a card's own base rarity, not a " +
                "rarity themselves. " +
                "FOR RIFTBOUND: read BOTH the card's frame style AND the small gem-shaped symbol next to " +
                "the collector number — report exactly one of: 'Common' (plain bronze frame, round gem), " +
                "'Uncommon' (silver frame, triangular gem), 'Rare' (gold full-art frame with a foil sheen, " +
                "square gem), 'Epic' (a more minimal gold frame, foil sheen, pentagonal gem), or 'Showcase' " +
                "(no colored frame at all — a full-bleed foil card, the chase rarity above Epic). A " +
                "Showcase card may ALSO be a special Alternate Art/Overnumbered/Signature print, but that " +
                "doesn't change the rarity value to report — it's still 'Showcase' either way (see the " +
                "printing/finish field elsewhere for that distinction). If the card is from an unnumbered " +
                "promotional release rather than a normal numbered set, report 'Promo' instead regardless of " +
                "frame style. Leave this blank rather than guess if the frame/gem isn't legible. " +
                "FOR GUNDAM: like One Piece, don't guess from visual style — a letter code is printed " +
                "directly next to the collector number (near the TOP-right of the card for this game, " +
                "unlike most others above which print it near the bottom). Read that exact code and report " +
                "the matching full name: 'C' = 'Common', 'U' = 'Uncommon', 'R' = 'Rare', 'LR' = 'Legend " +
                "Rare', 'SP' = 'Special' (a premium alt-art REPRINT of an existing card, keeping that " +
                "card's original number — not a brand-new print), 'P' = 'Promo'. A '+' or '++' suffix on " +
                "any of the four booster-rarity codes (e.g. 'LR+', 'C++') means this print is also an " +
                "alternate-art version — report the BASE letter's rarity (e.g. 'LR+' is still 'Legend " +
                "Rare'), not a different value; there's a separate printing/finish field elsewhere for that " +
                "distinction. Leave rarity blank if the code isn't legible rather than guessing from the " +
                "art. " +
                "FOR EVERY OTHER GAME: leave this field blank unless an exact rarity tier name is legibly " +
                "printed on the card itself (e.g. a printed 'Rare'/'Secret Rare' marker) — visual-style-based " +
                "guessing has only been worked out and verified for Magic, Pokemon, Yu-Gi-Oh, Lorcana, SWU, " +
                "and Riftbound above (One Piece and Gundam above instead read an exact printed code, not a visual " +
                "guess); don't extend any of those " +
                "games' rules to a different game's cards. " +
                "Narrows an image/price search among same-name/same-set prints that differ by rarity, and " +
                "becomes the item's initial saved Rarity value on this guess (staff can correct it in the " +
                "review queue or later in the catalog, same as any other field).",
            },
            foil: { type: "boolean", description: "Whether the card appears foil/holo" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            bbox: {
              type: "object",
              description: "Bounding box of just this one card's pocket within the full photo, as fractions (0.0 to 1.0) of the photo's total width/height — used to crop this exact card out of the page photo as its own real-photo reference. The bottom edge of a pocket is usually the clearest, most unambiguous line on the page — anchor there first, then find the top edge, which more often blends into the pocket/page above it. If you're unsure exactly where the card ends, err toward a slightly LARGER box rather than a tight one — a little extra background is much less of a problem than clipping part of the card.",
              properties: {
                x_min: { type: "number", description: "Left edge, as a fraction of image width" },
                y_min: { type: "number", description: "Top edge, as a fraction of image height — the edge most likely to be underestimated (cut too low, clipping the card's top). When unsure, place this slightly higher (smaller value) than your best guess." },
                x_max: { type: "number", description: "Right edge, as a fraction of image width" },
                y_max: { type: "number", description: "Bottom edge, as a fraction of image height — usually the clearest edge to locate; anchor this one first." },
              },
              required: ["x_min", "y_min", "x_max", "y_max"],
            },
          },
          required: ["position", "name", "game", "confidence", "bbox"],
        },
      },
    },
    required: ["cards"],
  },
};

const PROMPT_TEXT = "This is a photo of one page of a trading card binder — clear plastic " +
  "pockets, each holding one card. Identify every card you can see. For each, give its name " +
  "as printed, the game it's from, the set/expansion if you can tell, its printed collector " +
  "number if legible, its rarity if you can tell from printed text or a rarity symbol, " +
  "whether it looks foil/holo, its rough grid position, and how confident you are. A single " +
  "card name can have many different prints (alternate arts, different rarities, and — for a " +
  "serialized card — even physically distinct one-of-one copies) that only the set, number, " +
  "and rarity actually tell apart, so look closely for those even when you're confident about " +
  "the name. The collector number's location on the card varies by game: Pokemon prints it " +
  "near the set symbol at the bottom; Magic prints it in the small bottom-left corner text " +
  "instead, alongside a rarity letter and language code (e.g. '0744 LTR • EN' means collector " +
  "number '0744' — keep leading zeros exactly as printed); Yu-Gi-Oh prints a full set code there " +
  "instead of a bare number (e.g. 'LOB-005') — report it exactly as printed, letters and hyphen " +
  "included; One Piece prints its full code (set letters + number, e.g. 'OP01-001') together in the " +
  "bottom-right corner, right next to the rarity letter — report only the number portion after the " +
  "dash (e.g. '001') as the number, and the set-letters portion (e.g. 'OP01') as the set; Lorcana prints " +
  "it in the same bottom-left area in the same number/total-in-set format Pokemon uses (e.g. '154/204') — " +
  "report it exactly as shown; Riftbound prints a set-code-plus-number-plus-total combo at the bottom " +
  "(e.g. 'OGN-310/298') — report just the middle number ('310') as the number, and the set-letters " +
  "prefix ('OGN') as the set. For set, prefer the specific expansion name over the " +
  "general era/block if it's legible near the set symbol — for Pokemon cards, 'Scarlet & " +
  "Violet' alone is too vague when a more specific expansion name (e.g. 'Paldean Fates') can " +
  "be read; One Piece rarely prints an expansion name at all, so use its set-code prefix instead (see " +
  "above); Lorcana never prints an expansion name either, only a bare set number in that same bottom-left " +
  "text — report that number as the set; Riftbound likewise never prints an expansion name, only the " +
  "short set-letters code described above. For rarity on a Magic card, read the small expansion symbol's COLOR on the type line " +
  "(right edge, just above the rules text): black/white is 'Common' (also basic lands, which have " +
  "no symbol), silver is 'Uncommon', gold is 'Rare', red-orange is 'Mythic Rare', purple is " +
  "'Special' (Time Spiral timeshifted cards only), and a glowing/prismatic mythic symbol is 'Bonus' " +
  "(bonus-sheet cards like Vintage Masters' Power Nine) — leave it blank if the color truly isn't " +
  "legible rather than guessing from how good or powerful the card looks. For rarity on a " +
  "Yu-Gi-Oh card, judge from WHERE the foil/holo treatment sits, not overall art style: no foil " +
  "anywhere is 'Common'; foil on the name only (flat art) is 'Rare'; foil on the art only (flat " +
  "name) is 'Super Rare'; foil on BOTH name and art is 'Ultra Rare'; the same plus a raised, " +
  "embossed 3D texture is 'Ultimate Rare'; a diagonal rainbow holographic pattern over the name is " +
  "'Secret Rare'; a solid gold-colored name is 'Gold Rare'; a pale, washed-out, near-translucent " +
  "holographic art look is 'Ghost Rare'. Only report 'Platinum Secret Rare', 'Prismatic Secret " +
  "Rare', \"Collector's Rare\", 'Starlight Rare', or 'Quarter Century Secret Rare' if the entire " +
  "card front (border included) is unmistakably rainbow/holographic — these look similar to each " +
  "other and to plain Secret Rare in a photo, so leave rarity blank rather than guess between them " +
  "if you're not confident. For rarity on a Pokemon " +
  "card, judge PRIMARILY from the card's overall visual style, matching one of " +
  "Pokemon's real rarity names exactly (not a description) — how much of the card front is " +
  "illustration vs. a normal colored border/text box, whether the border itself is a foil/metallic " +
  "finish, and whether the Pokemon's name has an 'ex'/'EX'/'GX'/'V' suffix — rather than trying to " +
  "read tiny printed rarity text, which is often illegible from an ordinary binder photo even when " +
  "the card itself is clearly identifiable. Modern cards (2023+, lowercase 'ex'): full-bleed " +
  "edge-to-edge art with a holo border line is 'Illustration Rare' (non-ex) or 'Ultra Rare' (ex); " +
  "the same full-bleed art plus extra glitter foil is 'Special Illustration Rare'; a normal small " +
  "boxed-art frame with all-over foil for an ex Pokemon is 'Double Rare'; an all-gold border/" +
  "background is 'Hyper Rare' ('Mega Hyper Rare' instead if the Pokemon is a 'Mega ___ ex'). For " +
  "any 'Mega ___ ex' Pokemon (2025+ Mega Evolution era), check first whether the attack name itself " +
  "is printed in Japanese katakana instead of English — if so it's a 'Mega Attack Rare' regardless " +
  "of how full-art the rest of the card looks. Older cards (2012-2022, uppercase '-EX'/'-GX'/'V'): a normal frame " +
  "with the art breaking past its border, foil, for an EX/GX/V Pokemon is 'Rare Holo EX'/'Rare Holo " +
  "GX'/'Rare Holo V'; a non-EX/GX/V card with foil over just the art is 'Rare Holo'; full art with a " +
  "text bar remaining is 'Rare Ultra'; the same full art plus a gold border (or a collector number " +
  "past the set's total) is 'Rare Secret'. CAUTION: 'Ultra Rare' and 'Rare Ultra' are the same two " +
  "words in opposite order for two different eras — re-check which word comes first before answering " +
  "either one. Only fall back to reading a tiny rarity symbol/text for " +
  "the plain Common/Uncommon/Rare tiers, and leave rarity blank rather than guess if that's not " +
  "legible. A card with a black star symbol or otherwise reading as a standalone promotional release " +
  "(no regular numbered-set collector number) is 'Promo' instead, regardless of visual style. The " +
  "'ex'/'EX'/'GX'/'V'/'VMAX'/'VSTAR' suffix itself is a card subtype, not a rarity, and " +
  "must never be reported as the rarity value — it's only a clue for picking the right rarity name " +
  "above. For rarity on a One Piece card, don't guess from visual style — read the short letter code " +
  "printed right next to the collector number in the bottom-right corner (e.g. 'OP01-121 SEC') and map " +
  "it exactly: C=Common, UC=Uncommon, R=Rare, SR=Super Rare, SEC=Secret Rare, L=Leader, SP=Special " +
  "Rare, TR=Treasure Rare, MR=Manga Rare (report 'Manga Rare', not plain 'Secret Rare', if the code or " +
  "an Oda-manga-panel art style tells you it's specifically that one). A small star above that code " +
  "means this print is also a parallel/alternate-art version, but doesn't change which rarity value " +
  "to report. Leave it blank if the code isn't legible rather than guessing from the art. For rarity on " +
  "a Lorcana card, read the SHAPE of the small symbol printed next to the collector number: a plain " +
  "filled circle is 'Common'; a book icon is 'Uncommon'; a triangle is 'Rare'; a diamond is 'Super " +
  "Rare'; a pentagon is 'Legendary'; a six-sided/hexagon shape with an unmistakable rainbow or " +
  "holographic finish across the whole card is 'Enchanted' (the rarest tier — looks distinctly " +
  "different from the others, never just plain foil). If the card is from an unnumbered promotional " +
  "release rather than a normal numbered set, report 'Promo' instead regardless of the shape shown. " +
  "For rarity on a Star Wars: Unlimited (SWU) card, read the gemstone/star symbol near the collector " +
  "number: grey/clear gemstone is 'Common'; green gemstone is 'Uncommon'; blue gemstone is 'Rare'; a " +
  "gold/yellow STAR (not a gemstone) is 'Legendary'. A premium foil/art treatment (Hyperspace, " +
  "Showcase, Prestige) doesn't change this value — it's a separate layered treatment, not a rarity. " +
  "Leave it blank for a card that doesn't clearly match one of those four looks (e.g. a suspected " +
  "'Special'-rarity card) rather than guessing, since that fifth tier has no confirmed visual marker. " +
  "For rarity on a Riftbound card, read BOTH the frame style and the small gem-shaped symbol next to " +
  "the collector number: plain bronze frame with a round gem is 'Common'; silver frame with a " +
  "triangular gem is 'Uncommon'; gold full-art frame with foil and a square gem is 'Rare'; a more " +
  "minimal gold frame with foil and a pentagonal gem is 'Epic'; no colored frame at all (a full-bleed " +
  "foil card) is 'Showcase', the chase rarity above Epic — a Showcase card that's also a special " +
  "Alternate Art/Overnumbered/Signature print is still just 'Showcase' for this field, not a different " +
  "value. An unnumbered promotional card is 'Promo' regardless of frame style. Leave it blank rather " +
  "than guess if the frame/gem isn't legible. " +
  "For rarity on a Gundam card, same as One Piece, don't guess from visual style — read the letter " +
  "code printed next to the collector number (near the top-right of the card for this game): " +
  "C=Common, U=Uncommon, R=Rare, LR=Legend Rare, SP=Special (a premium alt-art reprint of an existing " +
  "card, keeping its original number), P=Promo. A '+' or '++' suffix (e.g. 'LR+', 'C++') means an " +
  "alternate-art version but doesn't change which of those values to report — 'LR+' is still 'Legend " +
  "Rare'. Leave it blank if the code isn't legible rather than guessing from the art. " +
  "For every " +
  "other game, leave rarity blank unless an exact tier name is legibly printed on " +
  "the card itself — the visual-style guessing above is only verified for Magic, Yu-Gi-Oh, Pokemon, " +
  "Lorcana, SWU, and Riftbound (One Piece and Gundam instead read an exact printed code, not a visual " +
  "guess). " +
  "If you can't confidently identify a specific card, " +
  "still report it with your best guess and confidence \"low\" rather than skipping it. Do " +
  "not guess condition or price — only identification. Also give " +
  "a bounding box around just that one card's pocket (not the whole page), as fractions of " +
  "the full photo's width/height — this is used to crop that exact card out of the page " +
  "photo, so it needs to actually bound that card and not a neighboring one. Anchor on the " +
  "pocket's bottom edge first, since it's usually the clearest line on the page, then find " +
  "the top edge — that one's more often underestimated because it blends into the pocket " +
  "above. When uncertain, err toward a slightly larger box rather than a tight one: a little " +
  "extra background in the crop is fine, clipping part of the card is not.";

// Staff only (CLAUDE.md "Staff-only access"). Supabase already rejects a
// call without a valid login, but once members can sign in with Discord a
// valid login no longer means staff. The caller is looked up on the auth
// server (not just read from the token), so removing someone's staff flag
// takes effect right away. The service-role key is auto-provided to every
// Edge Function; it's only used here to look the user up.
async function callerIsStaff(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !key) return false;
  const { data, error } = await createClient(url, key).auth.getUser(token);
  return !error && data?.user?.app_metadata?.staff === true;
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin") || "");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  if (!(await callerIsStaff(req))) {
    return json({ error: "Staff only" }, 403, headers);
  }

  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return json({ error: "Missing image" }, 400, headers);
    }
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return json({ error: "Expected a base64 data URL" }, 400, headers);
    }
    const [, mediaType, base64Data] = match;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "Server not configured (missing ANTHROPIC_API_KEY secret)" }, 500, headers);
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        // Tried pinning `temperature: 0` here to reduce run-to-run
        // detection variance (3-7 cards detected across reruns of the same
        // photo) — confirmed via a real API error that this model rejects
        // the parameter outright ("`temperature` is deprecated for this
        // model"), not just ignores/clamps it, so it can't be set at all.
        // Prompt caching. The tool schema + PROMPT_TEXT (~7,500 tokens of
        // per-game rarity/set/number rules) are identical on every call;
        // only the photo changes. A cache is a prefix match in the order
        // tools → system → messages, so the instructions live in `system`
        // (ahead of the photo) with the cache marker on it — that caches
        // tools + system together. Within 5 minutes of the last call (a
        // stack-scanning session is a steady stream of calls), that prefix
        // is billed at ~10% of the normal input price instead of in full.
        // Same instructions, word for word — previously they were a text
        // block after the image in the user message, where the changing
        // image ahead of them made them uncacheable.
        tools: [DETECT_CARDS_TOOL],
        tool_choice: { type: "tool", name: "report_detected_cards" },
        system: [{ type: "text", text: PROMPT_TEXT, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
              { type: "text", text: "Report every card in this photo with the report_detected_cards tool." },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return json({ error: `Anthropic API error: ${errText}` }, 502, headers);
    }

    const data = await anthropicRes.json();
    const toolUse = (data.content || []).find((b) => b.type === "tool_use");
    const cards = toolUse?.input?.cards || [];

    // The API's own token counts for this call, passed through so real
    // costs (and whether the cache is hitting — cache_read_input_tokens > 0)
    // can be checked from the browser's network tab or a log, instead of
    // estimated. The app ignores this field.
    const usage = data.usage || null;
    console.log("scan-binder-page usage", JSON.stringify(usage));
    return json({ cards, usage }, 200, headers);
  } catch (err) {
    return json({ error: String(err) }, 500, headers);
  }
});

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}
