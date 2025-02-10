USE bookstore;

DROP FUNCTION IF EXISTS generate_unique_random_OrdersID;
DROP FUNCTION IF EXISTS generate_unique_random_ProductsID;
DROP TABLE IF EXISTS feedbacks;
DROP TABLE IF EXISTS ordersProducts;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS wishlist;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS staff;


CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE
);

CREATE TABLE IF NOT EXISTS staff (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);
INSERT INTO staff (username, display_name, password) VALUES ('staff', 'staff', '$2a$10$uUJGW6TVnOTkazes1af/aO2ohWAOXLOQfEbR84mWg7psVnHQgy1k.');

DELIMITER //
CREATE TRIGGER before_insert_user
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
    DECLARE new_id INT;
    SET new_id = FLOOR(RAND() * 90000) + 10000; -- Generates a random 5-digit number

    -- Check for uniqueness and regenerate if necessary
    WHILE EXISTS (SELECT 1 FROM users WHERE id = new_id) DO
        SET new_id = FLOOR(RAND() * 90000) + 10000;
    END WHILE;

    SET NEW.id = new_id;
END; //
DELIMITER ;

INSERT INTO users (username, display_name, password, email) VALUES ('user123', 'user123', '$2a$10$uUJGW6TVnOTkazes1af/aO2ohWAOXLOQfEbR84mWg7psVnHQgy1k.', 'example@gmail.com'); /* password: password */

CREATE TABLE IF NOT EXISTS orders (
    ordersID VARCHAR(16) PRIMARY KEY,
    customerID INT UNSIGNED,
    ordersDate DATE,
    orderStatus VARCHAR(50) DEFAULT 'Comfirmed',
    subtotalPrice float(2) NOT NULL,
    shippingPrice float(2) NOT NULL,
    totalAmounts  INT UNSIGNED NOT NULL,
    FOREIGN KEY (customerID) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS products (
    productID VARCHAR(16) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    description VARCHAR(510) NOT NULL,
    type VARCHAR(255) NOT NULL,
    price float(2),
    stock INT NOT NULL
);

DELIMITER $$
CREATE FUNCTION generate_unique_random_ProductsID() 
RETURNS VARCHAR(16) 
DETERMINISTIC 
BEGIN
    DECLARE random_id VARCHAR(16);
    DECLARE id_exists INT DEFAULT 1;

    WHILE id_exists = 1 DO
        SET random_id = '';
        WHILE LENGTH(random_id) < 16 DO
            SET random_id = CONCAT(random_id, SUBSTRING('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', FLOOR(RAND() * 62) + 1, 1));
        END WHILE;

        -- Check if the generated ID already exists in the Order table
        SELECT COUNT(*) INTO id_exists FROM products WHERE productID = random_id;
    END WHILE;

    RETURN random_id;
END $$
DELIMITER ;

INSERT INTO products (productID, name, author, description, type, price, stock) VALUES ('A98DB973KWL8XP1L', 'The Family Book', 'Todd Parr', 'The Family Book by Todd Parr is a vibrant children\'s picture book that explores the diversity of family structures in a fun and engaging way. Published in 2003, it is designed for young readers and emphasizes the message that all families, regardless of their makeup, are special and deserving of love.', 'Story Book', 6.40, 5);
INSERT INTO products (productID, name, author, description, type, price, stock) VALUES ('41T81V4BZZQH0FOY', 'Maybe Days', 'Jennifer Wilgocki and Marcia Kahn Wright', 'Maybe Days: A Book for Children in Foster Care is a children\'s picture book co-authored by Jennifer Wilgocki and Marcia Kahn Wright, published in 2001. It is specifically designed to address the unique experiences and emotions of children in foster care, providing them with reassurance and understanding during a time of uncertainty.', 'Story Book', 9.29, 5);
INSERT INTO products (productID, name, author, description, type, price, stock) VALUES ('KH9NHAKRFF6XFV4D', 'Boy', 'Phil Cummings', 'Boy by Phil Cummings, illustrated by Shane Devries, is a poignant children\'s picture book published in May 2017. The story revolves around a young boy who is hearing-impaired and communicates through sign language and drawings. Despite his inability to hear the chaos of battle between the king and a dragon, Boy\'s unique perspective becomes the catalyst for resolving conflict.', 'Story Book', 9.99, 5);

INSERT INTO products (productID, name, author, description, type, price, stock) VALUES ('1D36OFE9MK0FW0X5', 'Ceremony: Welcome to Our Country', 'Adam Goodes and Ellie Laing', 'Ceremony: Welcome to Our Country is a children\'s picture book co-authored by Adam Goodes and Ellie Laing, with illustrations by David Hardy. Released in April 2022, this book serves as a joyful introduction to First Nations culture, specifically focusing on the Adnyamathanha people of the Flinders Ranges.', 'Story Book', 12.99, 5);
INSERT INTO products (productID, name, author, description, type, price, stock) VALUES ('8IXY4B8S3GU73WIO', 'This Book Thinks Ya Deadly!', 'Corey Tutt','This Book Thinks Ya Deadly! by Corey Tutt, illustrated by Molly Hunt, is a vibrant and inspirational celebration of First Nations excellence, published in 2023. The book serves as a compendium that highlights the achievements of 80 Indigenous Australians across various fields, including arts, sports, science, and activism.', 'Story Book', 14.99, 5);
INSERT INTO products (productID, name, author, description, type, price, stock) VALUES ('ONRGBG1AALOPK1C6', 'Mommy, Mama and Me & Daddy, Papa and Me', 'Leslea Newman', 'Mommy, Mama, and Me and Daddy, Papa, and Me are two companion board books written by Lesléa Newman and illustrated by Carol Thompson. Published in 2009, these books are groundbreaking as they are among the first board books specifically designed for children with same-sex parents. They celebrate family diversity through simple, relatable narratives.', 'Story Book', 7.59, 5);

INSERT INTO products (productID, name, author, description, type, price, stock) VALUES ('VJKZIMV2HQH8R65P', 'A House for Everyone', 'Jo Hirst', 'A House for Everyone: A Story to Help Children Learn about Gender Identity and Gender Expression by Jo Hirst, illustrated by Naomi Bardoff, is a children\'s picture book published in 2018. This book serves as an important resource for introducing young readers to the concepts of gender identity and expression, promoting acceptance and understanding of diversity.', 'Story Book', 15.89, 0);

CREATE TABLE IF NOT EXISTS ordersProducts (
    ordersID VARCHAR(16),
    productID VARCHAR(16),
    productName VARCHAR(255),
    quantity INT,
    PRIMARY KEY (ordersID, productID),
    FOREIGN KEY (ordersID) REFERENCES orders(ordersID),
    FOREIGN KEY (productID) REFERENCES products(productID)
);

DELIMITER $$
CREATE FUNCTION generate_unique_random_OrdersID() 
RETURNS VARCHAR(16) 
DETERMINISTIC 
BEGIN
    DECLARE random_id VARCHAR(16);
    DECLARE id_exists INT DEFAULT 1;

    WHILE id_exists = 1 DO
        SET random_id = '';
        WHILE LENGTH(random_id) < 16 DO
            SET random_id = CONCAT(random_id, SUBSTRING('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', FLOOR(RAND() * 62) + 1, 1));
        END WHILE;

        -- Check if the generated ID already exists in the Order table
        SELECT COUNT(*) INTO id_exists FROM `orders` WHERE ordersID = random_id;
    END WHILE;

    RETURN random_id;
END $$
DELIMITER ;

CREATE TABLE IF NOT EXISTS wishList (
	productID VARCHAR(16),
    userID INT UNSIGNED,
    PRIMARY KEY (productID, userID),
    FOREIGN KEY (userID) REFERENCES users(id),
    FOREIGN KEY (productID) REFERENCES products(productID)
);

CREATE TABLE IF NOT EXISTS feedbacks (
	feedbackID INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	userID INT UNSIGNED NOT NULL,
	feedback VARCHAR(5000),
    FOREIGN KEY (userID) REFERENCES users(id)
)

