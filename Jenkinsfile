// Smart Campus Complaint & Maintenance Management System
// Pipeline: Backend Tests -> Frontend Check -> Docker Build
//           -> Docker Smoke Test -> Docker Hub Push

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
    }

    stages {

        // ==========================================
        // STAGE 1: BACKEND LINT AND TESTS
        // ==========================================
        stage('Backend: lint and tests') {
            steps {
                bat '''
                    @echo off
                    echo ==============================
                    echo BACKEND: LINT AND TESTS
                    echo ==============================

                    python -m venv .venv
                    if errorlevel 1 exit /b 1

                    call .venv\\Scripts\\activate.bat

                    python -m pip install --quiet --upgrade pip
                    if errorlevel 1 exit /b 1

                    python -m pip install --quiet -r backend\\requirements-dev.txt
                    if errorlevel 1 exit /b 1

                    python -m ruff check backend
                    if errorlevel 1 exit /b 1

                    python -m pytest backend\\tests -q
                    if errorlevel 1 exit /b 1

                    echo Backend checks passed.
                '''
            }
        }

        // ==========================================
        // STAGE 2: FRONTEND JAVASCRIPT CHECK
        // ==========================================
        stage('Frontend: JavaScript check') {
            steps {
                bat '''
                    @echo off
                    echo ==============================
                    echo FRONTEND JAVASCRIPT CHECK
                    echo ==============================

                    node --check frontend\\js\\api.js
                    if errorlevel 1 exit /b 1

                    node --check frontend\\js\\app.js
                    if errorlevel 1 exit /b 1

                    node --check frontend\\js\\charts.js
                    if errorlevel 1 exit /b 1

                    node --check frontend\\js\\config.js
                    if errorlevel 1 exit /b 1

                    node --check frontend\\js\\ui.js
                    if errorlevel 1 exit /b 1

                    echo Frontend syntax checks passed.
                '''
            }
        }

        // ==========================================
        // STAGE 3: BUILD DOCKER IMAGE
        // ==========================================
        stage('Docker: build image') {
            steps {
                bat '''
                    @echo off
                    echo ==============================
                    echo BUILDING DOCKER IMAGE
                    echo ==============================

                    docker build -t %IMAGE%:%BUILD_NUMBER% .
                    if errorlevel 1 exit /b 1

                    docker tag %IMAGE%:%BUILD_NUMBER% %IMAGE%:latest
                    if errorlevel 1 exit /b 1

                    echo Docker image built successfully.
                '''
            }
        }

        // ==========================================
        // STAGE 4: DOCKER SMOKE TEST
        // ==========================================
        stage('Docker: smoke test') {
            steps {
                bat '''
                    @echo off
                    echo ==============================
                    echo DOCKER SMOKE TEST
                    echo ==============================

                    docker rm -f cmms-smoke >nul 2>&1

                    docker run -d --name cmms-smoke ^
                        -e SECRET_KEY=jenkins-smoke-secret-0123456789 ^
                        -e ADMIN_EMAIL=ci@example.com ^
                        -e ADMIN_PASSWORD=ci-password-12345 ^
                        %IMAGE%:%BUILD_NUMBER%

                    if errorlevel 1 exit /b 1

                    echo Waiting for application startup...

                    set "HEALTH_OK=0"

                    for /L %%i in (1,1,30) do (
                        docker exec cmms-smoke python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read().decode())" >nul 2>&1

                        if not errorlevel 1 (
                            set "HEALTH_OK=1"
                            goto health_complete
                        )

                        timeout /t 2 /nobreak >nul
                    )

                    :health_complete

                    if "%HEALTH_OK%"=="0" (
                        echo Health check failed.
                        docker logs cmms-smoke
                        exit /b 1
                    )

                    echo Health endpoint passed.

                    docker exec cmms-smoke python -c "import urllib.request; assert b'Smart Campus Care' in urllib.request.urlopen('http://127.0.0.1:8000/', timeout=5).read()"

                    if errorlevel 1 (
                        echo Homepage check failed.
                        docker logs cmms-smoke
                        exit /b 1
                    )

                    echo Smoke test passed.
                '''
            }
        }

        // ==========================================
        // STAGE 5: PUSH TO DOCKER HUB
        // ==========================================
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
                        echo ==============================
                        echo DOCKER HUB LOGIN
                        echo ==============================

                        echo %DH_PASS% | docker login -u %DH_USER% --password-stdin
                        if errorlevel 1 exit /b 1

                        echo ==============================
                        echo TAGGING DOCKER IMAGE
                        echo ==============================

                        docker tag %IMAGE%:%BUILD_NUMBER% %DH_USER%/%IMAGE%:%BUILD_NUMBER%
                        if errorlevel 1 exit /b 1

                        docker tag %IMAGE%:%BUILD_NUMBER% %DH_USER%/%IMAGE%:latest
                        if errorlevel 1 exit /b 1

                        echo ==============================
                        echo PUSHING DOCKER IMAGE
                        echo ==============================

                        docker push %DH_USER%/%IMAGE%:%BUILD_NUMBER%
                        if errorlevel 1 exit /b 1

                        docker push %DH_USER%/%IMAGE%:latest
                        if errorlevel 1 exit /b 1

                        docker logout

                        echo Docker Hub push completed.
                    '''
                }
            }
        }
    }

    // ==========================================
    // POST-BUILD ACTIONS
    // ==========================================
    post {
        always {
            bat '''
                @echo off
                docker rm -f cmms-smoke >nul 2>&1
                exit /b 0
            '''
        }

        success {
            echo 'Smart Campus CI/CD pipeline completed successfully.'
        }

        failure {
            echo 'Pipeline failed. Check the first failed stage in Console Output.'
        }
    }
}
