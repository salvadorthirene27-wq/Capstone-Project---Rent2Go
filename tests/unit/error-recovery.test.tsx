// @vitest-environment jsdom
import React from "react";
import {afterEach,it,expect,vi} from "vitest";
import {render,screen,cleanup} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorPage from "../../src/app/error";
afterEach(cleanup);
it("uses Next's retry callback to refetch a failed page and provides a working escape route",async()=>{
 const retry=vi.fn();render(<ErrorPage retry={retry}/>);
 await userEvent.setup().click(screen.getByRole("button",{name:"Try again"}));
 expect(retry).toHaveBeenCalledTimes(1);
 expect(screen.getByRole("link",{name:"Return to marketplace home"}).getAttribute("href")).toBe("/");
 expect(screen.getByRole("heading",{level:1}).textContent).toBe("We couldn’t load this page");
});
