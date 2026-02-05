
**

## RP Business Manager
Repository: https://github.com/DizzyBHigh/RP-Business-Manager

A powerful, offline-first RolePlay Business Manager designed for Red Dead Redemption (RedM) and GTA V RP servers (FiveM) or similar roleplay communities. 

It helps players and business owners track:

 - Crafting Recipes,  
 - Raw / Salvaged materials / Items  
 - Warehouse/shop  stock,  
 - pricing,  
 - employee commissions,  
 - ledger (full accounting), 
 - pending orders,  
 - and more

All in a beautiful, responsive single-page web app.
Perfect for lumber mills, factories, shops, resource gatherer / resellers, or any in-game business that involves complex crafting chains and stock management.
Features

## Order Management

Create orders for the recipes and items you crate of have scavenged.

 - Build customer sales or restock orders with custom pricing tiers
   (bulk/shop) or a manually entered price. 
 - Send orders to a pending list for fulfilment at a later time.
 - Full Invoice generation with Show / Hide profit toggles, so you can
   see your exact profit margins while the customer can't.
 - Sell order to a customer or send to shop display or restock
   warehouse.

Crafting Tree & Calculator – 
 - Visual tree view with for sub-items showing all subitems required to 
   make the order. 
 - "Use Warehouse" toggles to use items in stock    rather    than
   crafting everything from scratch.
 - Live updated table showing materials and items needed to create the
   order

Completed Orders Shows all customer sales, and employee commission.
  -	Date
  - Order Id
  - Customer
  - Order Items
  - Weight
  - Sale total
  - Gross Profit
  - Employee Commission
  - Net Profit
 
 - Pay commission employees with 1 click

## Inventory Management

 - Manage Warehouse + Shop Display stock  set-up min-stock alerts for
   the shop so you know exactly what to make to keep your shop fully
   stocked. 
  
 - "Move to Display" buttons - to move warehouse stock to shop  shelf.

## Craftable Products
**Create goods for your business venture**

 - Create new recipes  Add/Remove ingredients 
   (raw materials or existing Recipes) 
 - Edit existing recipes

## Category Management and Price List
**Create categories to manage your products**
 - add / remove recipes / raw items from categories
 - drag and drop to change the order of categories and the items within

**Pricelist**
Set the prices for your categorised goods
 - Set Bulk and standard prices for your items.
 - Add items from pricelist to an order

## Stock and Raw Materials
**Manage Raw items (that you found in the wilds) or purchase from others.**
 - Set a price for the raw material
 - Set the weight for the material

**Purchase raw materials,** 

 - Add raw materials to your warehouse, set a price you paid to someone
   for the materials or for nothing if you obtained them yourself.

**Stock Manger**
Manage your shop and warehouse items
 - See whats on display in the shop
 - See how many items you have in the warehouse
 - Set a minimum amount of stock that should be in the shop
 - status shows what needs restocking
 - One click restocking of shop items
 - Add low stock to Restock Order

## Shop
Import shop items from in game screenshot of sales (REDM HSRP)

 - Shop Sales History
 - OCR import from screenshot of sales
 - Removes items from shop stock
 - Adds sales to the ledger and shop sales tables

## Management

**Business Manager**
Manage all aspects of your business

 - Set a passphrase for an added layer of security
 - Manage and disable passphrase
 - Edit Business Name and Tagline

**Employee Management**

 - Add employees and set their commission rate.
 - Change at commission rate at anytime
 - Previous sales reflect the previously set commission rates.

**Roles and Permissions**
Set roles for your employees, prevent certain roles from acessing parts of the site.

 - Manager - Full site access 
 - Assistant - nearly all areas 
 - Worker -   Limited Access
 - Viewer - (Default for new users) - Very limited access

**Permissions Editor**
Set which pages each role can access

## Ledger
Full financial ledger with running balance, weight tracking, and manager-only delete
Complete list of all transactions carried out

 - Orders 
 - Customer Sales 
 - warehouse restocks 
 - shop restocks 
 - shop sales (imported with OCR)
 - Commission Pay-outs
- Money Added
- Money Removed

**Data Import / Export**
Import or export any data for analysis in other programs or for backup just in case something goes wrong.

## Tech Used:

Pure HTML/CSS/JS (no build tools needed)
Firebase Firestore for shared business data
LocalStorage fallback
Responsive design (works on desktop and mobile)

## How to Use

Clone or download the repo
Open firebaseConfig-base.js
Follow the instructions to create a firebase store
Add your config to the bottom of the file
Save as firebaseConfig.js

Open index.html in any browser
Enter your business passphrase (or create one on first use)
Start managing your RP business!

Customize recipes in the Recipe Editor tab
Set raw material prices in Raw Materials
Define item categories in Category Manager
Adjust permissions via the roles document in Firebase

No server required for single-player use — Firebase is optional for shared/multi-device businesses.

For Developers / Server Owners
Contributing
Feel free to open issues or pull requests! This tool is built for the RP community.
Made with ❤️ by DizzyBHigh for the Chip n Cheerful Lumber crew and beyond.

Happy crafting — may your profits be high and your stock always full! 🌲🪵💰
