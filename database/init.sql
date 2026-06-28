CREATE DATABASE IF NOT EXISTS community_group_buy DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE community_group_buy;

DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS group_buys;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS pickup_points;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role ENUM('leader', 'resident') NOT NULL DEFAULT 'resident',
    community VARCHAR(100) DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role (role),
    INDEX idx_community (community)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pickup_points (
    id INT PRIMARY KEY AUTO_INCREMENT,
    leader_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    community VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    contact_person VARCHAR(50) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_leader (leader_id),
    INDEX idx_community (community)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    leader_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category ENUM('vegetable', 'fruit', 'other') NOT NULL DEFAULT 'other',
    unit VARCHAR(20) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url VARCHAR(500),
    min_group_size INT NOT NULL DEFAULT 5,
    max_quantity_per_person INT DEFAULT NULL,
    total_stock INT DEFAULT NULL,
    status ENUM('draft', 'active', 'ended') NOT NULL DEFAULT 'draft',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_leader (leader_id),
    INDEX idx_status (status),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_buys (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    pickup_point_id INT NOT NULL,
    leader_id INT NOT NULL,
    community VARCHAR(100) NOT NULL,
    cutoff_time DATETIME NOT NULL,
    current_people INT NOT NULL DEFAULT 0,
    min_people INT NOT NULL DEFAULT 5,
    status ENUM('ongoing', 'success', 'failed', 'cancelled') NOT NULL DEFAULT 'ongoing',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE CASCADE,
    FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_product (product_id),
    INDEX idx_pickup (pickup_point_id),
    INDEX idx_status (status),
    INDEX idx_cutoff (cutoff_time),
    INDEX idx_community (community)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(32) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    group_buy_id INT NOT NULL,
    product_id INT NOT NULL,
    pickup_point_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
    contact_name VARCHAR(50) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    community VARCHAR(100) NOT NULL,
    remark VARCHAR(500),
    cancelled_at DATETIME DEFAULT NULL,
    cancel_reason VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_buy_id) REFERENCES group_buys(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_group_buy (group_buy_id),
    INDEX idx_status (status),
    INDEX idx_order_no (order_no),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO users (username, password, nickname, phone, role, community, address) VALUES
('leader01', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '张团长', '13800138001', 'leader', '阳光花园', '阳光花园小区物业办公室'),
('leader02', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '李团长', '13800138002', 'leader', '幸福里', '幸福里A栋1单元101'),
('resident01', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '王女士', '13900139001', 'resident', '阳光花园', '阳光花园3栋2单元501'),
('resident02', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '赵先生', '13900139002', 'resident', '阳光花园', '阳光花园5栋1单元302'),
('resident03', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '刘阿姨', '13900139003', 'resident', '幸福里', '幸福里B栋3单元201');

INSERT INTO pickup_points (leader_id, name, community, address, contact_person, contact_phone) VALUES
(1, '阳光花园西门自提点', '阳光花园', '阳光花园小区西门保安室旁', '张团长', '13800138001'),
(1, '阳光花园东门自提点', '阳光花园', '阳光花园小区东门菜鸟驿站', '张团长', '13800138001'),
(2, '幸福里中心自提点', '幸福里', '幸福里小区中心花园便利店', '李团长', '13800138002');
