# Shopify AI Prompt: TeamSportBanners Custom Banner Form

Use this prompt in Shopify AI or as the theme customization brief.

```text
You are customizing the TeamSportBanners Shopify theme. Easify product options has been removed. Build a native Shopify product form section/snippet that matches the TeamSportBanners design-tool order form exactly and saves every customer value as Shopify line item properties.

Do not rebuild the product page. Do not change checkout. Do not break the existing Add to Cart form, cart drawer, or TeamSportBanners designer app link. Add the custom form inside the existing Shopify product form before the Add to Cart button.

Show this custom form only for banner/pennant products. Detect using product title, product type, and tags containing: banner, pennant, triangle, home plate, homeplate, pole pocket, grommet, or tbd:.

Form layout and fields:
- Team / logo name: text input, default to the product title before " - ", fallback "BULLDOGS". Save as properties[Team / logo name].
- Team logo: image upload with a square local preview. Save as properties[Team Logo].
- Team Manager(s): text input. Save as properties[Team Manager(s)].
- Asst.Manager(s): text input. Save as properties[Asst.Manager(s)].
- Coach: text input. Save as properties[Coach].
- Asst.Coach: text input. Save as properties[Asst.Coach].
- Team Mom/Dad: text input. Save as properties[Team Mom/Dad].
- Team Sponsor(s): text input. Save as properties[Team Sponsor(s)].
- Number of players *: select 1 through 20. Save as properties[Number of players].
- Sport: select Baseball, Softball, Soccer, Basketball, Football, Volleyball, Track & Field. Auto-select from product title/type/tags when possible. Save as properties[Sport].
- Banner type: select Hem & Grommet, Pole Pocket, Triangle, Home Plate. Auto-select from product title/type/tags when possible. Save as properties[Banner type].
- SVG layout: select Auto SVG layout, Photo Frame Template, Match Product Image. Save as properties[SVG layout].

Players panel:
- Header says "Players" on the left and "{count} players" on the right.
- Render one player card for each selected player count.
- Each player card includes:
  - index bubble: 1, 2, 3...
  - NAME label and input default "Player"; save as properties[Player 01 Name], properties[Player 02 Name], etc.
  - NO. label and input default "#1", "#2"; save as properties[Player 01 Number], properties[Player 02 Number], etc.
  - circular PHOTO placeholder
  - Upload button with image file input; save as properties[Player 01 Photo], properties[Player 02 Photo], etc.
- Show a local circular preview after a photo file is selected.
- Preserve typed player names/numbers when the player count changes.

Banner type behavior:
- If Banner type is Triangle or Home Plate, lock Number of players to 1 and disable every other player-count option.
- Do not disable the select itself because the selected value still needs to submit to Shopify.

Fulfillment data:
- Add one hidden input named properties[_TSB Custom Form JSON].
- Keep it synced with all visible fields and selected file names, so fulfillment can read one complete JSON record on the order.

Style:
- Match the screenshots: white background, slate bold labels, rounded bordered inputs, team name with team logo upload, two-column staff fields on desktop, four compact selects on desktop, card-style player rows, circular gray photo placeholder, blue upload button text.
- Mobile responsive: fields become one column, player card keeps name/number readable, photo and upload button stack cleanly.
- Scope all CSS under .tsb-custom-form to avoid breaking the Shopify theme.

Implementation:
- Create snippet snippets/tsb-custom-banner-form.liquid.
- Render it inside snippets/buy-buttons.liquid within the existing product form, before product-form__buttons.
- The product form must set enctype="multipart/form-data" so file uploads can be carried by FormData.
- Keep JavaScript scoped to this component and initialize each form only once.
```

Local implementation in this repo:

- Snippet: `output/shopify-live-theme/snippets/tsb-custom-banner-form.liquid`
- Render hook: `output/shopify-live-theme/snippets/buy-buttons.liquid`
