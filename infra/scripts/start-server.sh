#!/bin/bash

# Log file for debugging
LOGFILE="/var/log/user_data.log"
echo "Running user_data script" >> $LOGFILE

# Create a systemd service for the application
echo "[Unit]
Description=Backend API
After=network.target

[Service]
ExecStart=/home/ec2-user/app
Restart=always
User=root
StandardOutput=file:/var/log/app.log
StandardError=file:/var/log/app.err

[Install]
WantedBy=multi-user.target" > /etc/systemd/system/app.service

echo "Service file created" >> $LOGFILE

# Ensure the app is executable
chmod +x /home/ec2-user/app
echo "App made executable" >> $LOGFILE

# Reload systemd and start the app service
sudo systemctl daemon-reload
sudo systemctl enable app.service
sudo systemctl start app.service

echo "Systemd service started" >> $LOGFILE