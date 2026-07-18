import NextImage from "next/image";
import Link from "next/link";
import {
  BookOpenText,
  Bot,
  CheckCircle2,
  ClipboardList,
  Image as ImageIcon,
  Layers3,
  LifeBuoy,
  Ruler,
  ShoppingCart,
  Sparkles,
  Type
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const visualRefs = [
  {
    src: "/admin-support-guide/01-main-editor-product-loaded.png",
    title: "Main editor",
    vi: "Màn hình chính",
    width: 1440,
    height: 1000
  },
  {
    src: "/admin-support-guide/02-templates-and-bulk-generator.png",
    title: "Bulk generator",
    vi: "Tạo hàng loạt",
    width: 1440,
    height: 1000
  },
  {
    src: "/admin-support-guide/03-photo-frame-generator.png",
    title: "Photo Frame",
    vi: "Khung ảnh",
    width: 1440,
    height: 1000
  },
  {
    src: "/admin-support-guide/06-mobile-canva-style-ruler.png",
    title: "Mobile ruler",
    vi: "Ruler mobile",
    width: 390,
    height: 844
  }
];

const trainingOrder = [
  "Open product",
  "Select object",
  "Edit text/color",
  "Align with ruler",
  "Use assets",
  "Generate bulk",
  "Photo frame QA",
  "Save/cart/proof"
];

const workflowSections = [
  {
    icon: LifeBuoy,
    title: "1. Explain the tool to a customer",
    viTitle: "1. Giải thích công cụ cho khách",
    child: "This is like making a team poster. Pick a banner, tap the words or pictures, move them, change colors, then save it.",
    childVi: "Công cụ này giống như làm poster cho đội. Chọn banner, bấm chữ hoặc hình, kéo đi, đổi màu, rồi lưu lại.",
    purpose: "Use this first so the customer understands the tool before support explains buttons.",
    steps: [
      "Tell the customer they are editing the real banner, not filling a form.",
      "Point to the canvas as the main work area.",
      "Explain that every important piece is a layer: text, background, logo, clip art, photo, or decoration.",
      "Tell them to click or tap one piece first, then use the toolbar or panel to change it.",
      "Keep the first task simple: change one name, move one logo, or change one color."
    ],
    viSteps: [
      "Nói với khách rằng họ đang chỉnh trực tiếp trên banner thật, không phải điền form.",
      "Chỉ vào canvas là khu vực làm việc chính.",
      "Giải thích mỗi phần quan trọng là một layer: chữ, nền, logo, clip art, ảnh hoặc trang trí.",
      "Nói khách bấm vào một phần trước, rồi dùng thanh công cụ hoặc panel để chỉnh.",
      "Bắt đầu đơn giản: đổi một tên, kéo một logo hoặc đổi một màu."
    ],
    qa: "Customer can describe the basic idea back: tap item, edit item, save design."
  },
  {
    icon: Sparkles,
    title: "2. Start from a product template",
    viTitle: "2. Bắt đầu từ mẫu sản phẩm",
    child: "Pick the poster you like. Wait until all pictures and words show up. Then start changing it.",
    childVi: "Chọn poster con thích. Chờ hình và chữ hiện đủ. Rồi bắt đầu sửa.",
    purpose: "Use this for product pages like All-Star Baseball Banner or Atlanta Braves banner.",
    steps: [
      "Open the Shopify product page.",
      "Click the design/customize button.",
      "Wait until the designer opens and the product layout loads.",
      "Read the status message. It should say the exact product layout or source layout loaded.",
      "Check the canvas before editing: background, logo, clip art, player names, and decorative pieces should be visible.",
      "If a part is missing, do not tell the customer to rebuild it manually. Report the product URL and missing part."
    ],
    viSteps: [
      "Mở trang sản phẩm Shopify.",
      "Bấm nút design/customize.",
      "Chờ designer mở và layout sản phẩm tải xong.",
      "Đọc thông báo trạng thái. Nó nên cho biết layout sản phẩm/source layout đã tải.",
      "Kiểm tra canvas trước khi sửa: nền, logo, clip art, tên cầu thủ và trang trí phải hiện.",
      "Nếu thiếu phần nào, không bảo khách tự làm lại. Ghi URL sản phẩm và phần bị thiếu."
    ],
    qa: "No tiled placeholder, no blank background, no missing team logo, and no old external SVG dependency."
  },
  {
    icon: Type,
    title: "3. Edit text, names, numbers, and colors",
    viTitle: "3. Chỉnh chữ, tên, số áo và màu",
    child: "Tap the word. Type the new word. Pick the inside color and outline color.",
    childVi: "Bấm vào chữ. Gõ chữ mới. Chọn màu bên trong và màu viền.",
    purpose: "This is the most common customer support task on mobile.",
    steps: [
      "Select the text on the banner.",
      "Use the mobile text field or Text panel to type the new name, team name, or number.",
      "Use Text color for the fill color inside letters.",
      "Use Outline/Stroke color for the outside edge of letters.",
      "Use font, size, line height, letter spacing, rotate, and alignment only after the words are correct.",
      "If text is hard to select, open Layers and choose the named text layer."
    ],
    viSteps: [
      "Chọn chữ trên banner.",
      "Dùng ô chữ mobile hoặc Text panel để gõ tên mới, tên đội hoặc số áo.",
      "Dùng Text color để đổi màu bên trong chữ.",
      "Dùng Outline/Stroke color để đổi viền chữ.",
      "Chỉ chỉnh font, size, line height, letter spacing, xoay và canh lề sau khi chữ đã đúng.",
      "Nếu khó chọn chữ, mở Layers và chọn đúng layer chữ."
    ],
    qa: "Team and Player text stay visible when the mobile field receives focus. Player text is selected for replacement, the new name persists, and color controls affect the selected text."
  },
  {
    icon: Ruler,
    title: "4. Use the Canva-style ruler",
    viTitle: "4. Dùng Ruler giống Canva",
    child: "Turn on the ruler. Pull a blue line from the ruler. Use the line to make things straight.",
    childVi: "Bật thước. Kéo một đường xanh từ thước. Dùng đường đó để canh thẳng.",
    purpose: "Use when names, numbers, logos, or photos look crooked or uneven.",
    steps: [
      "Tap Ruler tools on the bottom toolbar.",
      "Confirm rulers appear on the top and left of the canvas.",
      "Drag from the top ruler downward to create a vertical guide.",
      "Drag from the left ruler across the banner to create a horizontal guide.",
      "Move the selected text, logo, photo, or clip art until it lines up with the guide.",
      "Double-check on mobile that the Ruler button did not open the old side panel.",
      "Tap Ruler tools again to hide rulers after alignment."
    ],
    viSteps: [
      "Bấm Ruler tools ở thanh dưới.",
      "Kiểm tra thước hiện ở phía trên và bên trái canvas.",
      "Kéo từ thước trên xuống để tạo guide dọc.",
      "Kéo từ thước trái sang để tạo guide ngang.",
      "Kéo chữ, logo, ảnh hoặc clip art đến khi thẳng với guide.",
      "Trên mobile, kiểm tra Ruler không mở panel cũ bên cạnh.",
      "Bấm Ruler tools lần nữa để ẩn thước sau khi canh xong."
    ],
    qa: "Top/left rulers show on canvas, guides can be created, and no side panel opens."
  },
  {
    icon: ImageIcon,
    title: "5. Replace background, team logo, and clip art",
    viTitle: "5. Thay nền, logo đội và clip art",
    child: "Open the picture box. Pick a new background, team name, or fun sports picture.",
    childVi: "Mở hộp hình. Chọn nền mới, tên đội hoặc hình thể thao.",
    purpose: "Use Assets when a customer wants a different style without starting over.",
    steps: [
      "Open Assets, Art, TeamName.",
      "Choose the correct banner type: Hem & Grommets, Pole Pocket, Triangle, or Home Plate.",
      "Pick the correct category: background, clip art, team name/logo, accessory, or photo frame.",
      "Search by team name, sport, mascot, color, or object.",
      "Click an asset to add or replace it on the canvas.",
      "Use Layers if the new asset needs to go behind text or in front of the background.",
      "Use Properties only after the right asset is selected."
    ],
    viSteps: [
      "Mở Assets, Art, TeamName.",
      "Chọn đúng loại banner: Hem & Grommets, Pole Pocket, Triangle hoặc Home Plate.",
      "Chọn đúng nhóm: background, clip art, team name/logo, accessory hoặc photo frame.",
      "Tìm theo tên đội, môn thể thao, mascot, màu hoặc đồ vật.",
      "Bấm asset để thêm hoặc thay trên canvas.",
      "Dùng Layers nếu asset cần ra sau chữ hoặc lên trước nền.",
      "Chỉ dùng Properties sau khi đã chọn đúng asset."
    ],
    qa: "Asset appears once, is not tiled, and uses backed-up hosted assets."
  },
  {
    icon: Layers3,
    title: "6. Use Layers and Properties safely",
    viTitle: "6. Dùng Layers và Properties an toàn",
    child: "Layers are like a stack of stickers. Put some stickers in front and some behind.",
    childVi: "Layers giống như chồng sticker. Có sticker ở trước, có sticker ở sau.",
    purpose: "Use when objects overlap, disappear, or need exact styling.",
    steps: [
      "Open Layers when an object is hard to click on the canvas.",
      "Select the exact layer by name, such as Player text, Background, Logo, or Clip art.",
      "Use Bring to front if the item is hidden behind another item.",
      "Use Send to back for backgrounds or large decorative pieces.",
      "Use Lock after a background/photo is correct so it cannot move by accident.",
      "Open Properties to adjust fill, stroke, stroke width, opacity, rotate, gradient, and background fit.",
      "Do not change many properties at once; change one, check the canvas, then continue."
    ],
    viSteps: [
      "Mở Layers khi khó bấm một phần trên canvas.",
      "Chọn đúng layer theo tên, ví dụ Player text, Background, Logo hoặc Clip art.",
      "Dùng Bring to front nếu phần đó bị che phía sau.",
      "Dùng Send to back cho nền hoặc hình trang trí lớn.",
      "Dùng Lock sau khi nền/ảnh đã đúng để không kéo nhầm.",
      "Mở Properties để chỉnh fill, stroke, stroke width, opacity, rotate, gradient và background fit.",
      "Không chỉnh quá nhiều cùng lúc; chỉnh một phần, kiểm tra canvas, rồi tiếp tục."
    ],
    qa: "Object order is correct, no important text is hidden, and locked items stay fixed."
  },
  {
    icon: Sparkles,
    title: "7. Make designs in bulk",
    viTitle: "7. Tạo thiết kế hàng loạt",
    child: "Type the team info once. The tool makes many poster choices for you.",
    childVi: "Nhập thông tin đội một lần. Công cụ tạo nhiều lựa chọn poster.",
    purpose: "Use for teams, leagues, rosters, or staff production work.",
    steps: [
      "Open Templates.",
      "Enter the team name exactly as the customer wants it printed.",
      "Enter manager, assistant manager, coach, team mom, sponsor, and player count if available.",
      "Enter player names and numbers before choosing the final visual style.",
      "Choose sport, banner type, and SVG/template style.",
      "Choose layout, background, logo, clip art, accessory, and photo-frame options.",
      "Click Generate Preview for one design.",
      "Click Preview All Layouts to compare multiple layouts.",
      "Pick the best readable version, then click Use This Design.",
      "QA every generated design before adding to cart."
    ],
    viSteps: [
      "Mở Templates.",
      "Nhập tên đội đúng như khách muốn in.",
      "Nhập manager, assistant manager, coach, team mom, sponsor và số cầu thủ nếu có.",
      "Nhập tên và số cầu thủ trước khi chọn style cuối.",
      "Chọn sport, loại banner và SVG/template style.",
      "Chọn layout, nền, logo, clip art, accessory và photo-frame.",
      "Bấm Generate Preview để xem một mẫu.",
      "Bấm Preview All Layouts để so sánh nhiều layout.",
      "Chọn bản dễ đọc nhất, rồi bấm Use This Design.",
      "QA từng mẫu trước khi thêm vào cart."
    ],
    qa: "Names fit, numbers match, layout is readable, and no player/photo area is covered."
  },
  {
    icon: ImageIcon,
    title: "8. Photo Frame workflow",
    viTitle: "8. Quy trình Photo Frame",
    child: "Put each player photo in a frame. Make sure every face is easy to see.",
    childVi: "Đặt ảnh từng cầu thủ vào khung. Nhớ kiểm tra mặt ai cũng thấy rõ.",
    purpose: "Use for player-photo banners and premium photo layouts.",
    steps: [
      "Open Templates.",
      "Turn on Use Photo Frame.",
      "Click Photo Frame Template.",
      "Pick a photo-frame layout that matches the player count.",
      "Upload or replace player photos.",
      "Select a photo-frame layer before using photo adjustment tools.",
      "Use Up, Down, Left, Right, Larger, Smaller, and Center to frame faces.",
      "Check every face at mobile and desktop sizes.",
      "Confirm names and numbers match the photos.",
      "Generate preview, then use the design only after photo QA passes."
    ],
    viSteps: [
      "Mở Templates.",
      "Bật Use Photo Frame.",
      "Bấm Photo Frame Template.",
      "Chọn layout khung ảnh đúng số cầu thủ.",
      "Upload hoặc thay ảnh cầu thủ.",
      "Chọn layer photo-frame trước khi dùng công cụ chỉnh ảnh.",
      "Dùng Up, Down, Left, Right, Larger, Smaller và Center để canh mặt.",
      "Kiểm tra từng khuôn mặt ở mobile và desktop.",
      "Xác nhận tên và số đúng với ảnh.",
      "Generate preview, rồi chỉ dùng thiết kế khi QA ảnh đạt."
    ],
    qa: "No face is cut off, all photos are clear, and every name/number matches."
  },
  {
    icon: ShoppingCart,
    title: "9. Save, cart, proof, and fulfillment",
    viTitle: "9. Lưu, cart, proof và fulfillment",
    child: "When the poster is done, save it and put it in the cart.",
    childVi: "Khi poster xong, lưu lại và cho vào giỏ hàng.",
    purpose: "Use after design approval or staff QA.",
    steps: [
      "Click Save editable design to keep the editable version.",
      "Click Add to cart to store the current design.",
      "Enter customer email when required.",
      "Use No print proof only when the customer does not need a proof email.",
      "Confirm the cart item has the correct preview image.",
      "Checkout on Shopify.",
      "For fulfillment, confirm proof image, editable JSON, SVG source when available, and fulfillment lookup ID exist."
    ],
    viSteps: [
      "Bấm Save editable design để lưu bản có thể chỉnh.",
      "Bấm Add to cart để lưu thiết kế hiện tại.",
      "Nhập email khách khi bắt buộc.",
      "Chỉ dùng No print proof khi khách không cần email proof.",
      "Kiểm tra item trong cart có đúng ảnh preview.",
      "Checkout trên Shopify.",
      "Cho fulfillment, kiểm tra ảnh proof, JSON chỉnh sửa, SVG source nếu có, và fulfillment lookup ID."
    ],
    qa: "Cart preview matches canvas and fulfillment data is recoverable."
  }
];

const aiPolicy = [
  {
    title: "Use AI for",
    vi: "Nên dùng AI cho",
    items: [
      "Drafting clearer support wording from approved facts.",
      "Checking Vietnamese/English translation clarity.",
      "Summarizing QA notes after a human test.",
      "Suggesting layout improvement ideas before a human approves."
    ],
    viItems: [
      "Viết lại hướng dẫn rõ hơn từ thông tin đã được duyệt.",
      "Kiểm tra độ rõ của bản dịch Việt/Anh.",
      "Tóm tắt ghi chú QA sau khi người thật đã test.",
      "Gợi ý cải thiện layout trước khi người thật duyệt."
    ]
  },
  {
    title: "Do not use AI for",
    vi: "Không dùng AI cho",
    items: [
      "Inventing exact product assets or saying a source is backed up without checking.",
      "Approving final customer proofs without human review.",
      "Replacing missing licensed logos with guessed artwork.",
      "Uploading API keys, customer private data, or order secrets into prompts."
    ],
    viItems: [
      "Tự bịa asset sản phẩm hoặc nói đã backup khi chưa kiểm tra.",
      "Duyệt proof cuối cho khách khi chưa có người kiểm tra.",
      "Thay logo bản quyền bị thiếu bằng hình đoán mò.",
      "Đưa API key, dữ liệu riêng của khách hoặc bí mật đơn hàng vào prompt."
    ]
  },
  {
    title: "Limit usage",
    vi: "Giới hạn usage",
    items: [
      "Batch questions into one prompt instead of many small prompts.",
      "Give screenshots, product URL, and exact issue in one request.",
      "Ask for ranked fixes, not broad opinions.",
      "Run one AI review, apply human judgment, then retest locally."
    ],
    viItems: [
      "Gộp câu hỏi vào một prompt thay vì nhiều prompt nhỏ.",
      "Đưa screenshot, URL sản phẩm và lỗi cụ thể trong một lần.",
      "Yêu cầu danh sách fix theo ưu tiên, không hỏi ý kiến chung chung.",
      "Chạy một lần AI review, người thật quyết định, rồi test lại local."
    ]
  }
];

const qaChecks = [
  "Product opens from customer journey.",
  "Background loads and is not tiled.",
  "Team logo loads from backed-up asset source.",
  "Clip art/accessories load from backed-up asset source.",
  "Text is selectable and editable.",
  "Mobile text field is usable.",
  "Team and Player text stay visible after tapping the mobile field; Player text is selected for replacement and the new name persists.",
  "Text and outline colors update selected text.",
  "Properties opens from the bottom toolbar.",
  "Ruler opens top/left canvas rulers and draggable guides.",
  "Layers can select hard-to-click objects.",
  "Bulk generator previews one design and all layouts.",
  "Photo Frame guide/gallery appears and photos can be adjusted.",
  "Cart preview matches canvas.",
  "Proof image, editable JSON, SVG source when available, and fulfillment lookup ID are recoverable."
];

function WorkflowCard({ section }: { section: (typeof workflowSections)[number] }) {
  const Icon = section.icon;
  return (
    <Card id={section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")} className="overflow-hidden">
      <CardHeader className="border-b bg-slate-50/70">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.viTitle}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 p-5 xl:grid-cols-[0.86fr_1.14fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <Badge variant="secondary">Explain simply</Badge>
            <p className="mt-3 text-sm leading-6 text-slate-800">{section.child}</p>
            <p className="mt-3 text-sm leading-6 text-slate-800">{section.childVi}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs font-black uppercase tracking-wide text-muted-foreground">Why this step matters</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{section.purpose}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              QA pass condition
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{section.qa}</p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <Badge variant="secondary">English steps</Badge>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {section.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <Badge variant="secondary">Tiếng Việt</Badge>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {section.viSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminSupportGuidePage() {
  return (
    <>
      <PageHeader
        title="Support Guide"
        description="Detailed bilingual playbook for staff training, customer support, bulk production, photo-frame QA, Canva-style ruler use, and controlled AI assistance."
        badge="Training Playbook"
      />

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="border-blue-200 bg-blue-50/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpenText className="h-5 w-5 text-blue-700" />
              <CardTitle>Best teaching method</CardTitle>
            </div>
            <CardDescription>Do not start with every feature. Teach the workflow in this order.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {trainingOrder.map((item, index) => (
                <div key={item} className="rounded-lg border bg-white p-3">
                  <div className="text-xs font-black text-primary">Step {index + 1}</div>
                  <div className="mt-1 text-sm font-black text-slate-950">{item}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border bg-white p-4 text-sm leading-6 text-slate-700">
              <strong>Rule:</strong> one task at a time. First help the customer change one word or move one logo. After that,
              teach color, ruler, layers, templates, and cart.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
              <CardTitle>Support call script</CardTitle>
            </div>
            <CardDescription>Short enough to read while helping a customer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-700">
            <p>
              <strong>English:</strong> Open your banner. Tap the part you want to change. If it is text, type the new
              words and choose a color. If it is a logo or picture, drag it where you want. Use Ruler tools to make
              everything straight. When it looks right, save it and add it to cart.
            </p>
            <p>
              <strong>Tiếng Việt:</strong> Mở banner của bạn. Bấm vào phần muốn sửa. Nếu là chữ, gõ chữ mới và chọn
              màu. Nếu là logo hoặc hình, kéo đến vị trí bạn muốn. Dùng Ruler tools để canh thẳng. Khi thấy đẹp, lưu
              lại và thêm vào giỏ hàng.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 space-y-5">
        {workflowSections.map((section) => (
          <WorkflowCard key={section.title} section={section} />
        ))}
      </div>

      <Card className="mt-6 border-amber-200 bg-amber-50/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-amber-800" />
            <CardTitle>AI helper policy: improve quality, limit usage</CardTitle>
          </div>
          <CardDescription>Use AI as a reviewer and writing assistant, not as the source of truth.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {aiPolicy.map((group) => (
            <div key={group.title} className="rounded-lg border bg-white p-4">
              <CardTitle className="text-sm">{group.title}</CardTitle>
              <CardDescription className="mt-1">{group.vi}</CardDescription>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-amber-700" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-4 space-y-2 border-t pt-3 text-sm leading-6 text-slate-700">
                {group.viItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <CardTitle>Final QA checklist</CardTitle>
          </div>
          <CardDescription>Use this before telling a customer or manager that the design path is ready.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {qaChecks.map((item) => (
            <div key={item} className="flex gap-2 rounded-md border p-3 text-sm text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
              <span>{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Visual references</CardTitle>
          <CardDescription>
            Screenshots are supporting examples only. The step-by-step workflow above is the primary training material.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {visualRefs.map((shot) => (
            <div key={shot.src} className="rounded-lg border bg-slate-50 p-3">
              <div className="mb-2">
                <div className="text-sm font-black text-slate-950">{shot.title}</div>
                <div className="text-xs text-muted-foreground">{shot.vi}</div>
              </div>
              <div className="overflow-hidden rounded-md border bg-white">
                <NextImage
                  src={shot.src}
                  alt={`${shot.title} / ${shot.vi}`}
                  width={shot.width}
                  height={shot.height}
                  className="h-auto w-full object-contain"
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-black text-slate-950">Source document</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Full editable Markdown copy remains in docs/team-banner-designer-support-guide-en-vi.md.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/support">Open support guide</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
