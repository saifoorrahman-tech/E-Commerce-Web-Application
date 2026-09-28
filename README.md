# E-Store

A small full-stack store: Node.js, Express, MongoDB (Mongoose), JWT login, and a plain HTML/JS storefront.

## Run it

1. Start MongoDB locally, or create a free MongoDB Atlas cluster.
2. Copy the settings below into a `.env` file next to `server.js`:
   ```
   PORT=3000
   MONGO_URI=mongodb://127.0.0.1:27017/estore
   JWT_SECRET=pick-a-long-random-string
   ```
3. `npm install` then `npm start`, and open http://localhost:3000.

On first start the app creates an admin (`admin@store.com` / `admin123`) and three sample products. Change that password before deploying anywhere public.

## Roles

- **User**: browse products, build a cart, place orders, view their own orders. Anyone who signs up is a user.
- **Admin**: everything above, plus add/edit/delete products, see all orders, and set order status.

## API

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Public |
| GET | `/api/products` | Public |
| POST / PUT / DELETE | `/api/products`, `/api/products/:id` | Admin |
| POST | `/api/orders` (body: `items: [{productId, qty}]`, `address`) | Logged in |
| GET | `/api/orders/mine` | Logged in |
| GET | `/api/orders` | Admin |
| PATCH | `/api/orders/:id/status` | Admin |

Order totals are calculated on the server from database prices, and stock is checked and reduced when an order is placed.

## Good next steps

Product images, search and pagination, MongoDB transactions around order placement, a payment provider (Stripe), and tests with Jest and Supertest.
