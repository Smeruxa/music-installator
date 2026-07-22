import type { JSX } from 'react'
import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { authStore } from './stores/auth'
import { LoginScreen } from './screens/LoginScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import styles from './App.module.scss'
import './styles/global.scss'

export default observer(function App(): JSX.Element {
    useEffect(() => {
        void authStore.hydrate()
    }, [])

    if (!authStore.ready) {
        return (
            <div className={styles.shell}>
                <div className={styles.loading}>Загрузка…</div>
            </div>
        )
    }

    return (
        <div className={styles.shell}>
            {authStore.loggedIn ? <LibraryScreen /> : <LoginScreen />}
        </div>
    )
})
