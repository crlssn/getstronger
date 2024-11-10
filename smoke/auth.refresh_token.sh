curl \
  --header "Content-Type: application/json" \
  --data '{"refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMzMxNDllNDUtNzY4Ny00YTllLTliMTMtYzUxNWM5N2YwNGM0Iiwic3ViIjoicmVmcmVzaF90b2tlbiIsImV4cCI6MTczMTc1NzU2MywiaWF0IjoxNzI5MTY1NTYzfQ.WJAkz_WIqqR7GIz3LqREQSmQVDx9ViYFvn20rPtAhXE"}' \
  https://localhost:8080/api.v1.AuthService/RefreshToken
