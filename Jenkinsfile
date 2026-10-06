// Jenkins pipeline: test -> build Docker image -> smoke test -> push to Docker Hub (main branch only).
// Needs a Jenkins credential of kind "Username with password" with ID: dockerhub-creds
// (Docker Hub username + a Docker Hub access token).

pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  // Jenkins on your laptop can't receive GitHub webhooks, so it checks GitHub every ~5 minutes.
  triggers { pollSCM('H/5 * * * *') }

  environment {
    IMAGE = 'smart-campus-cmms'
  }

  stages {

    stage('Backend: lint and tests') {
      steps {
        bat '''
          python -m venv .venv

          call .venv\\Scripts\\activate.bat

          python -m pip install --quiet --upgrade pip
          python -m pip install --quiet -r backend\\requirements-dev.txt

          cd backend

          ruff check .
          pytest -q
        '''
      }
    }

    stage('Frontend: JavaScript check') {
      steps {
        bat '''
          for %%f in (frontend\\js\\*.js) do (
            set "name=%%~nf"
            copy /Y "%%f" "%TEMP%\\%%~nf.mjs" >nul
            node --check "%TEMP%\\%%~nf.mjs"
            echo ok %%f
          )
        '''
      }
    }

    stage('Docker: build image') {
      steps {
        bat 'docker build -t %IMAGE%:%BUILD_NUMBER% .'
      }
    }

    stage('Docker: smoke test') {
      steps {
        bat '''
          docker rm -f cmms-smoke >nul 2>&1

          docker run -d --name cmms-smoke ^
            -e SECRET_KEY=jenkins-smoke-secret-0123456789 ^
            -e ADMIN_EMAIL=ci@example.com ^
            -e ADMIN_PASSWORD=ci-password-12345 ^
            %IMAGE%:%BUILD_NUMBER%

          echo Waiting for application to start...

          for /L %%i in (1,1,30) do (
            docker exec cmms-smoke python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/health').read().decode())" >nul 2>&1

            if not errorlevel 1 (
              echo Health check passed.
              goto smoke_health_ok
            )

            timeout /t 2 /nobreak >nul
          )

          echo Health check failed.
          docker logs cmms-smoke
          exit /b 1

          :smoke_health_ok

          docker exec cmms-smoke python -c "import urllib.request; assert b'Smart Campus Care' in urllib.request.urlopen('http://127.0.0.1:8000/').read()"

          echo Smoke test passed.
        '''
      }
    }

    stage('Docker: push to Docker Hub') {
      when {
        expression {
          env.GIT_BRANCH == 'origin/main' || env.GIT_BRANCH == 'main'
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
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

            docker tag %IMAGE%:%BUILD_NUMBER% %DH_USER%/%IMAGE%:%BUILD_NUMBER%
            docker tag %IMAGE%:%BUILD_NUMBER% %DH_USER%/%IMAGE%:latest

            docker push %DH_USER%/%IMAGE%:%BUILD_NUMBER%
            docker push %DH_USER%/%IMAGE%:latest

            docker logout
          '''
        }
      }
    }
  }

  post {
    always {
      bat 'docker rm -f cmms-smoke >nul 2>&1'
    }

    success {
      echo 'Pipeline finished: image built, tested and (on main) pushed to Docker Hub.'
    }

    failure {
      echo 'Pipeline failed. Open the stage with the red cross and read its log.'
    }
  }
}
