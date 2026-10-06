pipeline {
    agent any

    stages {
        stage('Check Tools') {
            steps {
                bat '''
                    echo ===== PYTHON =====
                    where python
                    python --version

                    echo ===== NODE =====
                    where node
                    node --version

                    echo ===== NPM =====
                    where npm
                    npm --version

                    echo ===== DOCKER =====
                    where docker
                    docker --version

                    echo ===== DOCKER COMPOSE =====
                    docker compose version

                    echo ===== GIT =====
                    git --version
                '''
            }
        }
    }
}
