from env._base import BaseEnv


class Env(BaseEnv):
    # The model the chat endpoint serves when the request does not name one.
    chat_model: str = "mistral-large-latest"


env = Env()
