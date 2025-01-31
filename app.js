const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const hashpassword = require('./tools/genhashpassword')
const rateLimit = require('express-rate-limit');
const dayjs = require('dayjs');
const cors = require('cors');

let corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200, // some legacy browers (IE11, various SmartTVs) choke on 204
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'x-client-key', 'x-client-token', 'x-client-secret', 'Authorization'],
    method: ['GET', 'POST', 'OPTION', 'PUT', 'DELETE', 'PUTCH']
  }
app.use(cors(corsOptions));


const limiter = rateLimit({
	windowMs: 60 * 1000, // 15 minutes
	limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
	message: 'Too many requests, please try again later.',
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
})

// Apply the rate limiting middleware to all requests.
app.use(limiter)

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
        console.log(results);

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
        res.status(200).json({ Products: results })
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
        res.status(200).json({ Products: results })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

app.post('/create-order', async (req,res) => {
    try {

        const {customerID, cart, price, total} = req.body;
        const formattedDate = dayjs().format('YYYY-MM-DD');
        console.log(formattedDate);

        const DBOP = await connectToSQL();

        let query =  'SELECT generate_unique_random_OrdersID() AS randomID'; // Get a random to be ORDER ID
        const [random_ID] = await DBOP.query(query);
        const orderID = random_ID[0].randomID; // Accessing the randomID directly

        query = 'INSERT INTO orders (ordersID, customerID, ordersDate, totalPrices, totalAmounts) VALUES (?, ?, ?, ?, ?)';
        [results] = await DBOP.query(query, [orderID, customerID, formattedDate, price, total]);

        cart.forEach(async cartItem => {
            query = 'INSERT INTO ordersProducts (ordersID, productID, quantity) VALUES (?, ?, ?)';
            [results] = await DBOP.query(query, [orderID, cartItem.productID, cartItem.quantity]);
        });

        res.status(200).json({ message: "Your order placed successfully!" })

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
    } catch (error){  
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

app.get('/getOrder/:userID', async (req,res)=>{
    try {
        const userID = req.params.userID;
        const DBOP = await connectToSQL();
        const query = 'SELECT ordersID, customerID, ordersDate, totalPrices, totalAmounts FROM orders WHERE customerID = ?';
        const [results] = await DBOP.query(query, [userID]);

        await DBOP.end(function(err) {
            if (err) throw err; // Handle any errors during closing

        });
        console.log(results);
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
        console.log(results);
        res.status(200).json({ data: results, products: products })
    } catch (error) {
        console.log(error);
        res.status(500).json( { message: 'Internal server error! '} );
    }
})

// Start the server
app.listen(5000, () => {
    console.log('Backend server running on port 5000');
});