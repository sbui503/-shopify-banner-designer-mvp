import express from "express";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();

const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES.split(","),
    hostScheme: "https",
    hostName: process.env.HOST.replace(/https?:\/\//, ""),
  },
  auth: { path: "/auth", callbackPath: "/auth/callback" },
  webhooks: { path: "/webhooks" },
  sessionStorage: new SQLiteSessionStorage("./database.sqlite"),
});

app.use(express.json({ limit: "50mb" }));
app.use(cors());

app.post("/apps/banner/save", shopify.validateAuthenticatedRequest(), async (req, res) => {
  const { session } = res.locals.shopify;
  const { image, productId } = req.body;
  try {
    const fileCreate = new shopify.api.rest.File({ session });
    fileCreate.originalSource = image;
    fileCreate.alt = "Custom Banner Design";
    await fileCreate.save({ update: true });
    const cartUrl = `https://${session.shop}/cart/add?id=${productId}&quantity=1&properties[_custom_design]=${fileCreate.id}&properties[_preview]=${fileCreate.url}`;
    res.status(200).json({ success: true, cartUrl, fileId: fileCreate.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.use(shopify.express);
app.listen(process.env.PORT || 3000);
