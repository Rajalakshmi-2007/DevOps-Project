// Smart Campus Complaint & Maintenance Management System
// Jenkins CI/CD Pipeline
// Backend Tests -> Frontend JS Check -> Docker Build
// -> Docker Smoke Test -> Docker Hub Push
//
// Windows Jenkins version
// Docker Hub credential ID: dockerhub-creds

pipeline {

    agent any

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    // Check GitHub for changes every 5 minutes
    triggers {
        pollSCM('H/5 * * * *')
    }

    environment {
        IMAGE = 'smart-campus-cmms'

        // Your installed Python 3.10
        PYTHON_EXE = 'C:\\Users\\praja\\AppData\\Local\\Programs\\Python\\Python310\\python.exe'
    }

    stages {

        // ==================================================
        // 1. BACKEND: LINT AND TESTS
        // ==================================================
        stage('Backend: lint and tests') {

            steps {

                bat '''
                    @echo off

                    echo ==========================================
                    echo BACKEND: LINT AND TESTS
                    echo ==========================================

                    echo.
                    echo Checking Python...
                    "%PYTHON_EXE%" --version

                    if errorlevel 1 (
                        echo ERROR: Python was not found.
                        exit /b 1
                    )

                    echo.
                    echo Creating virtual environment...

                    "%PYTHON_EXE%" -m venv .venv

                    if errorlevel 1 (
                        echo ERROR: Failed to create virtual environment.
                        exit /b 1
                    )

                    echo.
                    echo Installing/upgrading pip...

                    .venv\\Scripts\\python.exe -m pip install --quiet --upgrade pip

                    if errorlevel 1 (
                        echo ERROR: Failed to upgrade pip.
                        exit /b 1
                    )

                    echo.
                    echo Installing backend dependencies...

                    .venv\\Scripts\\python.exe -m pip install --quiet -r backend\\requirements-dev.txt

                    if errorlevel 1 (
                        echo ERROR: Failed to install backend dependencies.
                        exit /b 1
                    )

                    echo.
                    echo Running Ruff...

                    .venv\\Scripts\\python.exe -m ruff check backend

                    if errorlevel 1 (
                        echo ERROR: Ruff check failed.
                        exit /b 1
                    )

                    echo.
                    echo Running Pytest...

                    .venv\\Scripts\\python.exe -m pytest backend\\tests -q

                    if errorlevel 1 (
                        echo ERROR: Pytest failed.
                        exit /b 1
                    )

                    echo.
                    echo ==========================================
                    echo BACKEND CHECKS PASSED
                    echo ==========================================
                '''
            }
        }


        // ==================================================
        // 2. FRONTEND: JAVASCRIPT CHECK
        // ==================================================
        stage('Frontend: JavaScript check') {

            steps {

                bat '''
                    @echo off

                    echo ==========================================
                    echo FRONTEND: JAVASCRIPT CHECK
                    echo ==========================================

                    echo.
                    echo Checking Node.js...

                    node --version

                    if errorlevel 1 (
                        echo ERROR: Node.js was not found.
                        exit /b 1
                    )

                    echo.
                    echo Checking api.js...
                    node --check frontend\\js\\api.js

                    if errorlevel 1 (
                        echo ERROR: api.js failed.
                        exit /b 1
                    )

                    echo.
                    echo Checking app.js...
                    node --check frontend\\js\\app.js

                    if errorlevel 1 (
                        echo ERROR: app.js failed.
                        exit /b 1
                    )

                    echo.
                    echo Checking charts.js...
                    node --check frontend\\js\\charts.js

                    if errorlevel 1 (
                        echo ERROR: charts.js failed.
                        exit /b 1
                    )

                    echo.
                    echo Checking config.js...
                    node --check frontend\\js\\config.js

                    if errorlevel 1 (
                        echo ERROR: config.js failed.
                        exit /b 1
                    )

                    echo.
                    echo Checking ui.js...
                    node --check frontend\\js\\ui.js

                    if errorlevel 1 (
                        echo ERROR: ui.js failed.
                        exit /b 1
                    )

                    echo.
                    echo ==========================================
                    echo FRONTEND CHECK PASSED
                    echo ==========================================
                '''
            }
        }


        // ==================================================
        // 3. DOCKER: BUILD IMAGE
        // ==================================================
        stage('Docker: build image') {

            steps {

                bat '''
                    @echo off

                    echo ==========================================
                    echo DOCKER: BUILD IMAGE
                    echo ==========================================

                    docker --version

                    if errorlevel 1 (
                        echo ERROR: Docker was not found.
                        exit /b 1
                    )

                    echo.
                    echo Building Docker image...

                    docker build -t %IMAGE%:%BUILD_NUMBER% .

                    if errorlevel 1 (
                        echo ERROR: Docker build failed.
                        exit /b 1
                    )

                    echo.
                    echo Creating latest tag...

                    docker tag %IMAGE%:%BUILD_NUMBER% %IMAGE%:latest

                    if errorlevel 1 (
                        echo ERROR: Docker tag failed.
                        exit /b 1
                    )

                    echo.
                    echo ==========================================
                    echo DOCKER IMAGE BUILT SUCCESSFULLY
                    echo ==========================================
                '''
            }
        }


        // ==================================================
        // 4. DOCKER: SMOKE TEST
        // ==================================================
        stage('Docker: smoke test') {

            steps {

                bat '''
                    @echo off

                    echo ==========================================
                    echo DOCKER: SMOKE TEST
                    echo ==========================================

                    echo.
                    echo Removing old smoke-test container...

                    docker rm -f cmms-smoke >nul 2>&1

                    echo.
                    echo Starting application container...

                    docker run -d ^
                        --name cmms-smoke ^
                        -e SECRET_KEY=jenkins-smoke-secret-0123456789 ^
                        -e ADMIN_EMAIL=ci@example.com ^
                        -e ADMIN_PASSWORD=ci-password-12345 ^
                        %IMAGE%:%BUILD_NUMBER%

                    if errorlevel 1 (
                        echo ERROR: Docker container failed to start.
                        exit /b 1
                    )

                    echo.
                    echo Container started.
                    echo Waiting for application...

                    timeout /t 10 /nobreak >nul

                    echo.
                    echo Checking container status...

                    docker ps --filter "name=cmms-smoke"

                    echo.
                    echo Running health check...

                    set "HEALTH_OK=0"

                    for /L %%i in (1,1,20) do (

                        docker exec cmms-smoke python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read().decode())" >nul 2>&1

                        if not errorlevel 1 (
                            set "HEALTH_OK=1"
                            goto HEALTH_SUCCESS
                        )

                        echo Health check attempt %%i failed. Retrying...

                        timeout /t 2 /nobreak >nul
                    )

                    :HEALTH_SUCCESS

                    if "%HEALTH_OK%"=="0" (
                        echo.
                        echo ERROR: Health check failed.
                        echo.
                        echo Container logs:
                        docker logs cmms-smoke
                        exit /b 1
                    )

                    echo.
                    echo Health check passed.

                    echo.
                    echo Checking homepage...

                    docker exec cmms-smoke python -c "import urllib.request; assert b'Smart Campus Care' in urllib.request.urlopen('http://127.0.0.1:8000/', timeout=5).read()"

                    if errorlevel 1 (
                        echo ERROR: Homepage check failed.
                        echo.
                        echo Container logs:
                        docker logs cmms-smoke
                        exit /b 1
                    )

                    echo.
                    echo ==========================================
                    echo SMOKE TEST PASSED
                    echo ==========================================
                '''
            }
        }


        // ==================================================
        // 5. DOCKER: PUSH TO DOCKER HUB
        // ==================================================
        stage('Docker: push to Docker Hub') {

            when {

                expression {
                    env.GIT_BRANCH == 'origin/main' ||
                    env.GIT_BRANCH == 'main'
                }
            }

            steps {

                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DH_USER',
                        passwordVariable: 'DH_PASS'
                    )
                ]) {

                    bat '''
                        @echo off

                        echo ==========================================
                        echo DOCKER HUB: LOGIN
                        echo ==========================================

                        echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

                        if errorlevel 1 (
                            echo ERROR: Docker Hub login failed.
                            exit /b 1
                        )

                        echo.
                        echo ==========================================
                        echo DOCKER HUB: TAG IMAGES
                        echo ==========================================

                        docker tag %IMAGE%:%BUILD_NUMBER% %DH_USER%/%IMAGE%:%BUILD_NUMBER%

                        if errorlevel 1 (
                            echo ERROR: Version tag failed.
                            exit /b 1
                        )

                        docker tag %IMAGE%:%BUILD_NUMBER% %DH_USER%/%IMAGE%:latest

                        if errorlevel 1 (
                            echo ERROR: Latest tag failed.
                            exit /b 1
                        )

                        echo.
                        echo ==========================================
                        echo DOCKER HUB: PUSH VERSION
                        echo ==========================================

                        docker push %DH_USER%/%IMAGE%:%BUILD_NUMBER%

                        if errorlevel 1 (
                            echo ERROR: Version image push failed.
                            exit /b 1
                        )

                        echo.
                        echo ==========================================
                        echo DOCKER HUB: PUSH LATEST
                        echo ==========================================

                        docker push %DH_USER%/%IMAGE%:latest

                        if errorlevel 1 (
                            echo ERROR: Latest image push failed.
                            exit /b 1
                        )

                        docker logout

                        echo.
                        echo ==========================================
                        echo DOCKER HUB PUSH SUCCESSFUL
                        echo ==========================================
                    '''
                }
            }
        }
    }


    // ==================================================
    // POST BUILD
    // ==================================================
    post {

        always {

            bat '''
                @echo off

                echo Cleaning up smoke-test container...

                docker rm -f cmms-smoke >nul 2>&1

                exit /b 0
            '''
        }

        success {

            echo '=========================================='
            echo 'SMART CAMPUS CI/CD SUCCESSFUL!'
            echo '=========================================='
            echo 'Docker image built and tested successfully.'
            echo 'If this is the main branch, the image was pushed to Docker Hub.'
        }

        failure {

            echo '=========================================='
            echo 'SMART CAMPUS CI/CD FAILED'
            echo '=========================================='
            echo 'Check the first stage with the red cross.'
        }
    }
}
