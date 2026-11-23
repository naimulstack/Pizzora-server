# Pizzora – Online Pizza Ordering Platform

Pizzora is a full-stack online pizza ordering platform where customers can explore pizzas, place orders, and manage their purchases. Vendors can manage their pizza products and orders, while admins can manage users, vendors, and platform activities.

## Live Website: Client - https://pizzora-client.vercel.app
## Live Website: Server - https://pizzora-server.vercel.app


## Repositories



## ✨ Key Features

- Sign up and log in using email and password or Google authentication.
- Separate dashboards and permissions for customers, vendors, and admins.
- Vendors can add, update, and manage their pizza products.
- Customers can explore available pizzas and view product details.
- Customers can place orders and manage their orders.
- Vendors can manage their products, orders, and business activities.
- Vendors can access premium features through a paid subscription.
- Secure payment processing for subscriptions.
- Admins can manage users, vendors, orders, and platform activities.
- Users receive notifications about relevant platform activities.
- Optimized for desktop, tablet, and mobile devices.

## 🛠️ Technology Stack

### Frontend
- Next.js
- React
- JavaScript
- Tailwind CSS
- DaisyUI
- Better Auth
- Stripe
- React Icons
- Lucide React

### Backend
- Node.js
- Express.js
- MongoDB
- MongoDB Node.js Driver
- Better Auth
- JSON Web Token (JWT)
- JOSE
- Stripe
- CORS
- Dotenv

### Authentication & Payment
- Better Auth
- Google OAuth
- JWT Authentication
- Stripe Checkout

### Deployment
- Vercel – Frontend
- Vercel – Backend
- MongoDB Atlas – Database

## 📦 Important NPM Packages

### Client Packages


`next` - React framework 
| `react` - UI development 
| `react-dom` - React DOM rendering 
| `better-auth` - Authentication 
| `mongodb` - MongoDB connection 
| `stripe` - Payment integration 
| `tailwindcss` - Styling 
| `daisyui` - UI components 
| `lucide-react` - Icons 
| `react-icons` - Additional icons 

### Server Packages

| `express` - Backend API 
| `mongodb`  -  Database operations 
| `better-auth` - Authentication 
| `jose` - JWT verification 
| `stripe` - Payment processing 
| `cors` - Cross-origin requests
| `dotenv` - Environment variables 

## ⚙️ Installation & Setup

### Prerequisites

- Node.js (LTS recommended)
- npm
- MongoDB Atlas account or local MongoDB
- Git

### 1. Clone Repository

git clone YOUR_CLIENT_REPOSITORY_URL
cd pizzora-client
npm install

### 2. Clone Repository

Open another terminal:

git clone YOUR_SERVER_REPOSITORY_URL
cd pizzora-server
npm install

### 3. Configure Environment Variables


**Client `env local`:**

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_APP_URL=
MONGODB_URI=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=




**Server `env`:**

MONGODB_URI=
PORT=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
CLIENT_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
IMGBB_API_KEY=

