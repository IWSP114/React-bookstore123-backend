const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const hashpassword = require('./tools/genhashpassword')
const rateLimit = require('express-rate-limit');
const dayjs = require('dayjs');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs'); // To rename files
const path = require('path');

let corsOptions = {
    origin: 'http://localhost:5173',
    optionsSuccessStatus: 200, // some legacy browers (IE11, various SmartTVs) choke on 204
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'x-client-key', 'x-client-token', 'x-client-secret', 'Authorization'],
    method: ['GET', 'POST', 'OPTION', 'PUT', 'DELETE', 'PUTCH']
  }
app.use(cors(corsOptions));
app.use('/products', express.static(path.join(__dirname, 'products')));

const limiter = rateLimit({
	windowMs: 60 * 1000, // 1 minutes
	limit: 150, // Limit each IP to 150 requests per `window` (here, per 1 minutes).
	message: 'Too many requests, please try again later.',
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
})

// Apply the rate limiting middleware to all requests.
app.use(limiter)

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './products/'); // Specify the folder to save images
    },
    filename: function (req, file, cb) {
        // Use a temporary name for now
        const tempName = Date.now() + '-' + Math.random().toString(36).substr(2, 9); // Temporary unique name
        cb(null, `${tempName}.jpg`); // Temporary filename
    }
});

const upload = multer({ storage: storage });

//MySQL connection
async function connectToSQL() {
    try{
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'init',
            database: 'bookstore',
            waitForConnections: true,
            connectionLimit: 10, // Adjust based on your needs
            queueLimit: 0, // Unlimited queueing
            dateStrings: true // Ensures dates are returned as strings
            });
        return connection;
    } catch (error) {
        console.log("Error in connecting to SQL "+ error);
    }
}

app.use(express.json());

// User / Staff / Admin login
app.post('/login', async (req, res)=> {
    try {
        const data = req.body;
        //Check for all input
        function CheckAllInput(ReqBody) {
            const RequiredField = ['table','username', 'password'];
            return RequiredField.every(field=>ReqBody.hasOwnProperty(field));
        }
        if(!CheckAllInput(data)) {
            return res.status(400).json( { message: 'Not inputed all the required field'} )
        }

        //DB operation - check username exist
        const DBOP = await connectToSQL();
        const query = `SELECT * FROM ?? WHERE username = ?;`;
        const [results] = await DBOP.query(query, [data.table,data.username]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing
        });

       // If the user not exist
        if(results.length != 1) return res.status(404).json( { message: 'User not found!'} );

        // Check the user password with db password
        const hashresult = await hashpassword.compareHash(data.password, results[0].password); 
         if(hashresult) {
            return res.status(200).json( { message: 'Success!', data: results} );
         } else {
            return res.status(401).json( { message: 'Username or password incorrect!'} );
         } 
    } catch (error) {
        console.log(error);
        res.status(500).json( { error: 'Internal Server Error' } );
    }
})


// Register
app.post('/register', async (req, res)=>{
    try {
        const data = req.body;
        //Check for all input
        function CheckAllInput(ReqBody) {
            const RequiredField = ['email', 'username', 'password'];
            return RequiredField.every(field=>ReqBody.hasOwnProperty(field));
        }
        if(!CheckAllInput(data)) {
            return res.status(400).json( { message: 'Not inputed all the required field'} )
        }

        //DB operation - check if the user already exist
        let DBOP = await connectToSQL();
        let query = `SELECT * FROM users WHERE username = ?;`;
        let [results] = await DBOP.query(query, [data.username]);
        
        if(results.length > 0) return res.status(409).json( { message: 'User already exist!'} );

        //DB operation - check if the email already exist

        query = `SELECT * FROM users WHERE email = ?;`;
        [results] = await DBOP.query(query, [data.email]);
       
        if(results.length > 0) return res.status(409).json( { message: 'Email already has been taken!'} );

        //Hash the password
        const hashedPassword = await hashpassword.hashPassword(data.password);

        //DB operation - add a new user

        query = `INSERT INTO users (username, display_name, password, email) VALUES (?, ?, ?, ?);`;
        [results] = await DBOP.query(query, [data.username, data.username, hashedPassword, data.email]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing
        });

        return res.status(200).json( { message: 'Register successful!'} );

    } catch (error) {
        console.log(error);
        res.status(500).json( { error: 'Internal Server Error' } );
    }
})

//update user information but password
app.patch('/updateUser/:username', async (req, res)=> { 
    try {
        const { username } = req.params; // get it by jwt token
        const updates = req.body;
        if(!req.body) {
            res.status(400).json({message: 'Please make a change on profile.'});
        }
        //DB operation - check if the user already exist by using jwt token from front end server
        let DBOP = await connectToSQL();
        let query = `SELECT id FROM users WHERE username = ?;`;
        let [results] = await DBOP.query(query, [username]);

        if(results.length != 1) return res.status(404).json( { message: 'User not found!'} );

        //Check if the property is conflict
        const { email: email = null, username: newUsername = null, display_name: newDisplayName  } = updates;
        let conflictMessage = '';

        if (newUsername) {
            // Check if new username already exists
            query = `SELECT id FROM users WHERE username = ? AND id != ?;`;
            let [usernameCheck] = await DBOP.query(query, [newUsername, results[0].id]);
            if (usernameCheck.length > 0) {
                conflictMessage += 'Username is already taken. ';
            }
        }

        if (newDisplayName) {
            // Check if new username already exists
            query = `SELECT id FROM users WHERE display_name = ? AND id != ?;`;
            let [usernameCheck] = await DBOP.query(query, [newDisplayName, results[0].id]);
            if (usernameCheck.length > 0) {
                conflictMessage += 'The display name is already taken. ';
            }
        }

        if (email) {
            // Check if new email already exists
            query = `SELECT id FROM users WHERE email = ? AND id != ?;`;
            let [emailCheck] = await DBOP.query(query, [email, results[0].id]);
            if (emailCheck.length > 0) {
                conflictMessage += 'Email is already in use.';
            }
        }

        // If there are conflicts, return a 409 status with the conflict message
        if (conflictMessage) {
            return res.status(409).json({ message: conflictMessage.trim() });
        }

        // Update the user information by id
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        values.push(results[0].id); 

        query = `UPDATE users SET ${fields} WHERE id = ?`;
        [results] = await DBOP.query(query, values);
        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing
        });
        res.status(200).json( { message: "User information has been updated"} );

    } catch (error) {
        if(error.errno && error.errno === 1062) {
            res.status(409).json( { error: "This username has been used by other user" } );
        } else {
            console.log(error);
            res.status(500).json( { error: error.message } );
        }
    }
})

// Get user by the username
app.get('/getUser/:username' ,async (req,res)=> {
    try {
        const username = req.params.username;
        //DB operation
        const DBOP = await connectToSQL();
        const query = 'SELECT * FROM users WHERE username = ?'
        const [results] = await DBOP.query(query, [username]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing
        });



        res.status(200).json({ userdata: results })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

// Get all products
app.get('/getProduct', async (req,res)=>{
    try {
        const DBOP = await connectToSQL();
        const query = 'SELECT * FROM products';
        const [results] = await DBOP.query(query);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });

        // Construct full image URLs
        const productsWithImages = results.map(product => ({
            ...product,
            imageUrl: `http://localhost:5000/products/${product.productID}.jpg` // Adjust the URL as necessary
        }));

        res.status(200).json({ Products: productsWithImages })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

// Get single product
app.get('/getProduct/:productID', async (req,res)=>{
    try {
        const productID = req.params.productID;
        const DBOP = await connectToSQL();
        const query = 'SELECT * FROM products WHERE productID = ?';
        const [results] = await DBOP.query(query, [productID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        const productsWithImages = results.map(product => ({
            ...product,
            imageUrl: `http://localhost:5000/products/${product.productID}.jpg` // Adjust the URL as necessary
        }));

        res.status(200).json({ Products: productsWithImages })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

app.post('/create-order', async (req,res) => {
    let DBOP
    try {

        const {customerID, cart, subtotal, shipping, total} = req.body;
        const formattedDate = dayjs().format('YYYY-MM-DD');

        DBOP = await connectToSQL();

        let query =  'SELECT generate_unique_random_OrdersID() AS randomID'; // Get a random to be ORDER ID
        const [random_ID] = await DBOP.query(query);
        const orderID = random_ID[0].randomID; // Accessing the randomID directly

        await DBOP.beginTransaction();

        const [addOrder] = await DBOP.execute(
            'INSERT INTO orders (ordersID, customerID, ordersDate, subtotalPrice, shippingPrice,totalAmounts) VALUES (?, ?, ?, ?, ?, ?)', 
            [orderID, customerID, formattedDate, subtotal, shipping, total]
        );
        if (addOrder.affectedRows === 0) {
            throw new Error('Invalid destination orders');
        }

        for (const cartItem of cart) {
            const [addOrderProducts] = await DBOP.execute(
                'INSERT INTO ordersProducts (ordersID, productID, productName, quantity) VALUES (?, ?, ?, ?)',
                [orderID, cartItem.productID, cartItem.name, cartItem.quantity]
            );
            if (addOrderProducts.affectedRows === 0) {
                throw new Error('Invalid destination products');
            }

            const [minusStocks] = await DBOP.execute(
                'UPDATE products SET stock = stock - ? WHERE productID = ? AND stock >= ?',
                [cartItem.quantity, cartItem.productID, cartItem.quantity]
            );
            if (minusStocks.affectedRows === 0) {
                throw new Error('Not enough stock for product');
            }
        }
        await DBOP.commit();

        return res.status(200).json({ message: "Your order placed successfully!" })
    } catch (error){  
        if (DBOP) { // Only rollback if a connection was established
            await DBOP.rollback();
        }
        console.error('Transaction failed:', error);
        res.status(500).json({ message: "Out of stock!" })
    } finally {
        // Always release the connection
        if (DBOP) {
            try {
                await DBOP.end();
            } catch (endError) {
                console.error("Connection end failed:", endError);
            }
        }
    }
})


app.get('/getOrder/:userID', async (req,res)=>{
    try {
        const userID = req.params.userID;
        const DBOP = await connectToSQL();
        const query = 'SELECT ordersID, customerID, ordersDate, subtotalPrice, orderStatus, shippingPrice, totalAmounts FROM orders WHERE customerID = ?';
        const [results] = await DBOP.query(query, [userID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        res.status(200).json({ data: results })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

app.get('/getSingleOrder/:orderID', async (req,res)=>{
    try {
        const orderID = req.params.orderID;
        const DBOP = await connectToSQL();
        let query = 'SELECT * FROM orders WHERE ordersID = ?';
        const [results] = await DBOP.query(query, [orderID]);

        query = `
            SELECT ordersProducts.ordersID as ordersID, 
            ordersProducts.productID as productID, 
            ordersProducts.quantity as productQuantity, 
            products.name as productName,
            products.price as productPrice 
            FROM ordersProducts
            RIGHT JOIN products ON ordersProducts.productID = products.productID 
            WHERE ordersID = ?;
        `;
        const [products] = await DBOP.query(query, [orderID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        res.status(200).json({ data: results, products: products })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

// Product Control
app.post('/create-product', upload.single('image'), async (req, res)=> {
    try {
        const {productName, productAuthor, description, producType, productPrice, productStock} = req.body;    

        //DB operation
        const DBOP = await connectToSQL();
        let query =  'SELECT generate_unique_random_ProductsID() AS randomID'; // Get a random to be ORDER ID
        const [random_ID] = await DBOP.query(query);
        const productID = random_ID[0].randomID; // Accessing the randomID directly

        // Rename the uploaded image using productID
        const tempFilePath = path.join(__dirname, './products/', req.file.filename);
        const newFilePath = path.join(__dirname, './products/', `${productID}${path.extname(req.file.originalname)}`);
        
        fs.rename(tempFilePath, newFilePath, (err) => {
            if (err) {
                console.error('Error renaming file:', err);
                return res.status(500).json({ error: 'Error renaming file' });
            }
        });

        query = 'INSERT INTO products (productID, name, author, description, type, price, stock) VALUES (?, ?, ?, ?, ?, ?, ?)';
        [results] = await DBOP.query(query, [productID, productName, productAuthor, description, producType, productPrice, productStock]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing
        });
        res.status(200).json({ message: "Your product created successfully!" })
       
    } catch (error) {
        console.log(error);
        res.status(500).json( { error: 'Internal Server Error' } );
    }
})

app.delete('/api/delete-from-products', async (req, res) => {
    const { productID } = req.body;

    if (!productID) {
        return res.status(400).json({ error: 'Product ID is required' });
    }

    try {
        // DB operation
        const DBOP = await connectToSQL();
        
        // Disable foreign key checks
        await DBOP.query('SET foreign_key_checks = 0;');

        // Delete the product from the database
        await DBOP.query('DELETE FROM products WHERE productID = ?;', [productID]);

        // Re-enable foreign key checks
        await DBOP.query('SET foreign_key_checks = 1;');

        // Close the database connection
        await DBOP.end();

        // Construct the image path
        const imagePath = path.join(__dirname, 'products', `${productID}.jpg`); // Use path.join for cross-platform compatibility

        // Delete the image file
        fs.unlink(imagePath, (err) => {
            if (err) {
                console.error(`Error deleting file: ${err.message}`);
                return res.status(500).json({ error: 'Error deleting image' });
            }
            console.log('Image deleted successfully!');
            res.status(200).json({ message: "Success!" });
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.patch('/api/product-edit', async (req, res)=> { 
    try {
        const { productID, productName, productType, productAuthor, productPrice, productDescription, productStock } = req.body; 
        if(!req.body) {
            res.status(400).json({message: 'Please make a change on profile.'});
        }
        //DB operation - check if the user already exist by using jwt token from front end server
        let DBOP = await connectToSQL();
        let query = `UPDATE products SET name = ?, author = ?, description = ?, type = ?, price = ?, stock = ? WHERE productID = ?`;
        let [results] = await DBOP.query(query, [productName, productAuthor, productDescription, productType,  productPrice, productStock, productID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing
        });
        res.status(200).json( { message: "Success!"} );

    } catch (error) {  
        console.log(error);
        res.status(500).json( { error: error.message } );
    }
})

// Order Control
app.get('/api/getOrder', async (req,res)=>{
    try {
        const DBOP = await connectToSQL();
        const query = 
        `
        SELECT ordersID, customerID, users.username as customerName, ordersDate, orderStatus, subtotalPrice, shippingPrice, totalAmounts 
        FROM orders
        INNER JOIN users
        ON orders.customerID = users.id;
        `;
        const [results] = await DBOP.query(query);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        res.status(200).json({ data: results })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

app.patch('/api/updateOrder/:status/:orderID', async (req,res)=>{
    try {
        const orderID = req.params.orderID;
        const status = req.params.status;
        const DBOP = await connectToSQL();
        const query = 
        `
        UPDATE orders
        SET orderStatus = ?
        WHERE ordersID = ?
        `;
        await DBOP.query(query, [status, orderID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        res.status(200).json({ message: "Success!" })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

// Feed back
app.post('/api/create-feedback', async (req,res) => {
    let DBOP
    try {

        const {userID, feedback} = req.body;

        DBOP = await connectToSQL();

        let query =  'INSERT INTO feedbacks (userID, feedback) VALUES (?, ?)'; // Get a random to be ORDER ID
        await DBOP.query(query, [userID, feedback]);
        
        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        res.status(200).json({ message: "Success!" })

    } catch (error){  
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

app.get('/api/get-feedback', async (req,res) => {
    let DBOP
    try {
        DBOP = await connectToSQL();

        let query =  'SELECT * FROM feedbacks'; // Get feedbacks
        const [results] = await DBOP.query(query);
        
        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        res.status(200).json({ data: results })

    } catch (error){  
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

app.get('/api/get-feedback/:feedbackID', async (req,res) => {
    let DBOP
    try {
        const feedbackID = req.params.feedbackID;
        DBOP = await connectToSQL();

        let query =  
        `
        SELECT feedbackID, userID, feedback, username
        FROM feedbacks 
        INNER JOIN users
        ON feedbacks.userID = users.id
        WHERE feedbackID = ?
        `
        const [results] = await DBOP.query(query, [feedbackID]);
        
        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        res.status(200).json({ data: results })

    } catch (error){  
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

app.delete('/api/delete-feedback/:feedbackID', async (req,res) => {
    let DBOP
    try {
        const feedbackID = req.params.feedbackID;
        DBOP = await connectToSQL();

        let query =  `DELETE FROM feedbacks WHERE feedbackID = ?;`
        const [results] = await DBOP.query(query, [feedbackID]);
        
        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        res.status(200).json({ message: "Success!" })

    } catch (error){  
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

// Wishlist
app.get('/api/get-wish-list-by-productID/:productID/:userID', async (req, res) => {
     
    const userID = req.params.userID;
    const productID = req.params.productID;  

    try {
        //DB operation
        const DBOP = await connectToSQL();
        
        let query =  'SELECT * FROM wishList WHERE productID = ? AND userID = ? LIMIT 1'; // Get a random to be ORDER ID
        const [result] = await DBOP.query(query, [productID, userID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing
        });

        res.status(200).json({ result: result[0] });
    } catch (error) {
        console.log(error);
        res.status(500).json( { error: 'Internal Server Error' } );
    }
})

app.post('/api/add-to-wishlist', async (req, res) => {

    const {userID, productID} = req.body;
    try {
        //DB operation
        const DBOP = await connectToSQL();
        let query =  'INSERT INTO wishList (productID, userID) VALUES (?, ?);'; // Get a random to be ORDER ID
        const [result] = await DBOP.query(query, [productID, userID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });

        res.status(200).json({ message: "Success!" });
    } catch (error) {
        console.log(error);
        res.status(500).json( { error: 'Internal Server Error' } );
    }
})

app.delete('/api/delete-from-wishlist', async (req, res) => {

    const {userID, productID} = req.body;
    console.log(userID);
    console.log(productID);
    try {
        //DB operation
        const DBOP = await connectToSQL();
        let query =  'DELETE FROM wishList WHERE productID = ? AND userID = ?;'; // Get a random to be ORDER ID
        const [result] = await DBOP.query(query, [productID, userID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });

        res.status(200).json({ message: "Success!" });
    } catch (error) {
        console.log(error);
        res.status(500).json( { error: 'Internal Server Error' } );
    }
})

app.get('/api/get-all-wish-list/:userID', async (req, res) => {
     
    const userID = req.params.userID;

    try {
        //DB operation
        const DBOP = await connectToSQL();
        
        let query =  `
        SELECT 
            wishList.productID as productID, 
            wishList.userID as userID, 
            products.name as productName, 
            products.author as productAuthor, 
            products.type as productType, 
            products.price as productPrice,
            products.stock as productStock
        FROM wishList
        INNER JOIN products ON wishList.productID=products.productID
        WHERE wishList.userID = ?;
        `
        const [result] = await DBOP.query(query, [userID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing
        });

        const productsWithImages = result.map(product => ({
            ...product,
            imageUrl: `http://localhost:5000/products/${product.productID}.jpg` // Adjust the URL as necessary
        }));

        res.status(200).json({ products: productsWithImages });
    } catch (error) {
        console.log(error);
        res.status(500).json( { error: 'Internal Server Error' } );
    }
})

// Start the server
app.listen(5000, () => {
    console.log('Backend server running on port 5000');
});