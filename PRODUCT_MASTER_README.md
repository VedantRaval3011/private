# Product Master Module

## Overview
The Product Master module allows you to import and view product data from XML files. The system automatically detects Product Master XML files and imports them into the database when you use the "Scan & Process Files" feature from the home page.

## Features

### 1. Automatic XML Detection
- The system automatically identifies Product Master XML files based on their content
- Files named like "All-Product master-Wadhwan.XML" are detected as Product Master files
- Files containing key product fields (ITMCODE, MCADNO, STOCOND) are recognized

### 2. Key Product Data Fields
The following fields are extracted from the XML and displayed:
- **Therapeutic Category**: Product classification (e.g., ANTIBIOTIC)
- **Product Name**: Full product name
- **Product Code**: Unique product identifier
- **Department**: Product department (e.g., EYE DROPS)
- **Master Card No**: Master card reference number
- **Storage Condition**: Storage requirements and conditions
- **Product Type**: Type classification (e.g., EXPORT, IMPORT)

### 3. Database Storage
- Products are stored in MongoDB in the `productmasters` collection
- Duplicate products are automatically handled (upsert based on product code)
- All products from the same file are tracked by source file name

### 4. User Interface
- **Home Page**: Added "Product Master" link in the navigation bar
- **Product Master Page** (`/product-master`):
  - Modern, responsive table view
  - Search functionality across all fields
  - Pagination (50 records per page)
  - Statistics cards showing total products and current page
  - Styled with gradient headers and modern UI elements

## How to Use

### Importing Product Master Data

1. **Place XML File**
   - Copy your Product Master XML file to the `files/` folder in the project root
   - Example: `files/All-Product master-Wadhwan.XML`

2. **Run Scanner**
   - Go to the home page
   - Click "Scan & Process Files" button
   - The system will automatically detect and process the Product Master file
   - A success message will appear showing the number of products imported

3. **View Products**
   - Click "Product Master" in the navigation bar
   - Browse all imported products in a table view
   - Use search to find specific products

### Searching Products
- Enter any search term in the search box
- Searches across: Product Name, Product Code, Department, Master Card No, Therapeutic Category
- Results update automatically as you type

### Navigation
- Use pagination controls at the bottom of the table
- Shows current page number and total pages
- Previous/Next buttons to navigate through records

## Technical Details

### File Structure
```
src/
├── app/
│   ├── product-master/
│   │   └── page.tsx          # Product Master page UI
│   └── api/
│       └── product-master/
│           └── route.ts       # API endpoint for fetching products
├── lib/
│   ├── productMasterParser.ts # XML parser for Product Master
│   ├── xmlTypeDetector.ts     # Detects Product Master XML files
│   └── ingestionService.ts    # Handles file ingestion
└── models/
    └── ProductMaster.ts       # MongoDB schema
```

### XML Structure Mapping
The parser maps the following XML fields:
```xml
<G_CASEPACK>
  <ITMGROUP>ANTIBIOTIC</ITMGROUP>        → therapeuticCategory
  <ITMNAME>MAGCIP EYE DROPS 10ML</ITMNAME>  → productName
  <ITMCODE>RIEDUMG43</ITMCODE>           → productCode
  <DEPARTMENT>EYE DROPS</DEPARTMENT>     → department
  <MCADNO>MFEDUCP588</MCADNO>            → masterCardNo
  <STOCOND>STORE AT 25°C...</STOCOND>    → storageCondition
  <LOCEXP>EXPORT</LOCEXP>                → productType
</G_CASEPACK>
```

### API Endpoints

#### GET `/api/product-master`
Fetch product master data with pagination and search.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Records per page (default: 50)
- `search`: Search term (optional)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "productCode": "RIEDUMG43",
      "productName": "MAGCIP EYE DROPS 10ML",
      "department": "EYE DROPS",
      "masterCardNo": "MFEDUCP588",
      "storageCondition": "STORE AT TEMPERATURE NOT EXCEEDING 25°C...",
      "productType": "EXPORT",
      "therapeuticCategory": "ANTIBIOTIC",
      "sourceFile": "All-Product master-Wadhwan.XML"
    }
  ],
  "pagination": {
    "total": 3000,
    "page": 1,
    "limit": 50,
    "pages": 60
  }
}
```

### Database Schema
```typescript
interface IProductMaster {
  productCode: string;         // Required, indexed
  productName: string;         // Required
  department: string;          // Default: 'N/A'
  masterCardNo: string;        // Default: 'N/A'
  storageCondition: string;    // Default: 'N/A'
  productType: string;         // Default: 'N/A'
  therapeuticCategory: string; // Default: 'N/A'
  sourceFile: string;          // Required
  processedAt: Date;           // Auto-generated
}
```

## Workflow Integration

The Product Master module is fully integrated with the existing ingestion workflow:

1. **File Detection**: `xmlTypeDetector.ts` identifies Product Master files
2. **Parsing**: `productMasterParser.ts` extracts product data
3. **Storage**: `ingestionService.ts` saves to MongoDB using upsert
4. **Logging**: Processing results are logged in the `processinglogs` collection
5. **Display**: Data is viewable through the Product Master page

## Future Enhancements

Possible improvements:
- Export product data to Excel/CSV
- Advanced filtering (by department, product type, etc.)
- Bulk edit capabilities
- Product details modal with full information
- Import/Export history tracking
- Duplicate detection and merging

## Troubleshooting

### No products showing after scan
- Check that the XML file is in the `files/` folder
- Verify the file is a valid Product Master XML
- Check the Processing Logs page for errors
- Ensure MongoDB is connected

### Search not working
- Clear the search box and try again
- Check browser console for errors
- Verify the API endpoint is responding

### Parser errors
- Check the XML structure matches the expected format
- Ensure all required fields (ITMCODE, ITMNAME) are present
- Review the error message in Processing Logs

## Support
For issues or questions, refer to the main application documentation or check the Processing Logs page for detailed error messages.
